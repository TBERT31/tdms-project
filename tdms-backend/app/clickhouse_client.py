from clickhouse_driver import Client
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from datetime import datetime
import logging
from .config import settings

logger = logging.getLogger(__name__)


class ClickHouseClientV2:
    def __init__(self):
        """Client ClickHouse v2 avec architecture optimisée (partition par dataset)"""
        self.client = Client(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            database=settings.clickhouse_database,
            user=settings.clickhouse_user,
            password=settings.clickhouse_password,
            compression=True,  # <— compression TCP/native
            settings={
                # Inserts côté serveur asynchrones (regroupement auto si nécessaire)
                "async_insert": 1,
                "wait_for_async_insert": 0,
                # Taille bloc par défaut côté serveur (ajuste si besoin)
                "max_insert_block_size": 1_000_000,
            },
        )
        self.database = settings.clickhouse_database
        self._ensure_database_exists()
        self._create_tables()

    # ----------------------
    # Setup / DDL
    # ----------------------
    def _ensure_database_exists(self):
        """Crée la base de données si elle n'existe pas"""
        try:
            client_admin = Client(
                host=settings.clickhouse_host,
                port=settings.clickhouse_port,
                user=settings.clickhouse_user,
                password=settings.clickhouse_password,
                compression=True,
            )
            client_admin.execute(f"CREATE DATABASE IF NOT EXISTS {self.database}")
            logger.info(f"Base de données {self.database} créée/vérifiée")
        except Exception as e:
            logger.error(f"Erreur création database: {e}")
            raise

    def _create_tables(self):
        """Crée les tables (datasets, channels, sensor_data)"""

        # Table 1: Métadonnées des datasets
        datasets_table = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.datasets (
                dataset_id  UInt64,
                filename    String,
                created_at  DateTime64(3),
                total_points UInt64
            ) ENGINE = MergeTree()
            ORDER BY dataset_id
        """

        # Table 2: Métadonnées des channels
        channels_table = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.channels (
                channel_id  UInt32,
                dataset_id  UInt64,
                group_name  String,
                channel_name String,
                unit        String,
                has_time    UInt8,
                n_rows      UInt64
            ) ENGINE = MergeTree()
            ORDER BY (dataset_id, channel_id)
        """

        # Table 3: Données (partition par dataset, ORDER BY optimisé)
        # Ajout de dataset_id pour:
        #  - inserts groupés par dataset
        #  - suppression rapide via DROP PARTITION
        sensor_data_table = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.sensor_data (
                dataset_id    UInt64,
                channel_id    UInt32,
                timestamp     DateTime64(6) DEFAULT toDateTime64(0, 6),
                sample_index  UInt64 DEFAULT 0,
                value         Float64,
                is_time_series UInt8 DEFAULT 0
            ) ENGINE = MergeTree()
            PARTITION BY dataset_id
            ORDER BY (channel_id, is_time_series, timestamp, sample_index)
            SETTINGS index_granularity = 8192
        """

        try:
            self.client.execute(datasets_table)
            self.client.execute(channels_table)
            self.client.execute(sensor_data_table)
            logger.info("Tables ClickHouse créées/vérifiées (partition=dataset_id)")
        except Exception as e:
            logger.error(f"Erreur création tables: {e}")
            raise

    # ----------------------
    # Inserts optimisés
    # ----------------------
        def _insert_sensor_data_columnar(self, rows_dict: Dict[str, Any], chunk_rows: int = 1_000_000):
            """
            Insert columnar (beaucoup plus rapide que liste de tuples).
            rows_dict contient les colonnes:
            ["dataset_id","channel_id","timestamp","sample_index","value","is_time_series"]
            Valeurs: pandas Series / numpy arrays / listes (mêmes longueurs).
            L'envoi est chunké pour limiter l'empreinte mémoire.
            """
            # Longueur cohérente ?
            lengths = {len(v) for v in rows_dict.values()}
            if len(lengths) != 1:
                raise ValueError("Toutes les colonnes doivent avoir la même longueur")
            n = lengths.pop()
            if n == 0:
                return

            def _to_list(x):
                # Le driver (0.2.9) veut des list/tuple en columnar, pas des ndarrays.
                if isinstance(x, pd.Series):
                    return x.tolist()
                if isinstance(x, np.ndarray):
                    return x.tolist()
                # déjà liste/tuple
                return x

            # Envoi par morceaux
            for start in range(0, n, chunk_rows):
                end = min(start + chunk_rows, n)
                # Slice chaque colonne puis convertit en list
                col_dataset_id = _to_list(rows_dict["dataset_id"][start:end])
                col_channel_id = _to_list(rows_dict["channel_id"][start:end])
                col_timestamp  = _to_list(rows_dict["timestamp"][start:end])     # liste de str ISO
                col_sample_idx = _to_list(rows_dict["sample_index"][start:end])
                col_value      = _to_list(rows_dict["value"][start:end])
                col_is_ts      = _to_list(rows_dict["is_time_series"][start:end])

                self.client.execute(
                    """
                    INSERT INTO sensor_data
                    (dataset_id, channel_id, timestamp, sample_index, value, is_time_series)
                    VALUES
                    """,
                    [
                        col_dataset_id,
                        col_channel_id,
                        col_timestamp,
                        col_sample_idx,
                        col_value,
                        col_is_ts,
                    ],
                    columnar=True,
                )


    def insert_dataset_data(self, dataset_id: int, filename: str, channels_data: List[Dict[str, Any]]):
        """Insert un dataset complet: datasets + channels + sensor_data (columnar chunké)"""

        created_at = datetime.utcnow()
        total_points = int(sum(int(ch["n_rows"]) for ch in channels_data))

        # 1) datasets
        self.client.execute(
            "INSERT INTO datasets (dataset_id, filename, created_at, total_points) VALUES",
            [(dataset_id, filename, created_at, total_points)],
        )

        # 2) channels
        channels_meta = [
            (
                int(ch["channel_id"]),
                int(dataset_id),
                str(ch["group_name"]),
                str(ch["channel_name"]),
                str(ch.get("unit", "")),
                1 if bool(ch["has_time"]) else 0,
                int(ch["n_rows"]),
            )
            for ch in channels_data
        ]
        self.client.execute(
            "INSERT INTO channels (channel_id, dataset_id, group_name, channel_name, unit, has_time, n_rows) VALUES",
            channels_meta,
        )

        # 3) sensor_data (columnar + vectorisé)
        # Concaténation de colonnes numpy/pandas; conversion timestamp -> str ISO (rapide et fiable)
        ds_cols, ch_cols, ts_cols, idx_cols, val_cols, flag_cols = [], [], [], [], [], []

        iso_epoch = "1970-01-01 00:00:00.000000"

        for ch in channels_data:
            n = int(ch["n_rows"])
            if n == 0:
                continue

            # numpy arrays
            values = ch["values"]
            if not isinstance(values, (np.ndarray, pd.Series)):
                values = np.asarray(values, dtype=np.float64)
            else:
                values = np.asarray(values, dtype=np.float64)

            if ch["has_time"]:
                ts = ch["timestamps"]
                # vectorisé en pandas
                ts_pd = pd.to_datetime(ts)
                ts_str = ts_pd.strftime("%Y-%m-%d %H:%M:%S.%f")
                idx = np.zeros(n, dtype=np.uint64)
                flag = np.ones(n, dtype=np.uint8)
            else:
                # indices en sample_index + timestamp = epoch
                idx = np.asarray(ch["timestamps"], dtype=np.uint64)
                ts_str = pd.Series([iso_epoch] * n)
                flag = np.zeros(n, dtype=np.uint8)

            ds_cols.append(np.full(n, dataset_id, dtype=np.uint64))
            ch_cols.append(np.full(n, int(ch["channel_id"]), dtype=np.uint32))
            ts_cols.append(ts_str.astype(str).tolist())
            idx_cols.append(idx)
            val_cols.append(values)
            flag_cols.append(flag)

        if ds_cols:
            # Concaténation
            cat_dataset_id = np.concatenate(ds_cols)
            cat_channel_id = np.concatenate(ch_cols)
            cat_timestamp  = np.concatenate(ts_cols)          # array de str
            cat_sample_idx = np.concatenate(idx_cols)
            cat_value      = np.concatenate(val_cols)
            cat_is_ts      = np.concatenate(flag_cols)

            # IMPORTANT: convertit en list (le driver refuse ndarray en columnar)
            rows = {
                "dataset_id": cat_dataset_id.tolist(),
                "channel_id": cat_channel_id.tolist(),
                "timestamp":  cat_timestamp.tolist(),          # liste de str ISO
                "sample_index": cat_sample_idx.tolist(),
                "value": cat_value.tolist(),
                "is_time_series": cat_is_ts.tolist(),
            }
            self._insert_sensor_data_columnar(rows, chunk_rows=1_000_000)

        logger.info(f"Dataset {dataset_id} inséré: {len(channels_data)} channels, {total_points} points")

    # ----------------------
    # Reads
    # ----------------------
    def get_datasets(self) -> List[Dict[str, Any]]:
        """Liste tous les datasets"""
        result = self.client.execute(
            """
            SELECT dataset_id, filename, created_at, total_points
            FROM datasets
            ORDER BY created_at DESC
            """
        )
        return [
            {
                "id": row[0],
                "filename": row[1],
                "created_at": row[2],
                "total_points": row[3],
            }
            for row in result
        ]

    def get_channels(self, dataset_id: int) -> List[Dict[str, Any]]:
        """Liste les channels d'un dataset"""
        result = self.client.execute(
            """
            SELECT channel_id, group_name, channel_name, unit, has_time, n_rows
            FROM channels
            WHERE dataset_id = %(dataset_id)s
            ORDER BY channel_id
            """,
            {"dataset_id": dataset_id},
        )
        return [
            {
                "id": row[0],
                "channel_id": row[0],
                "dataset_id": dataset_id,
                "group_name": row[1],
                "channel_name": row[2],
                "unit": row[3],
                "has_time": bool(row[4]),
                "n_rows": row[5],
            }
            for row in result
        ]

    def get_channel_data(
        self,
        channel_id: int,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        limit: int = 50000,
    ) -> pd.DataFrame:
        """Récupère les données d'un channel (time series ou indexées)"""

        meta_result = self.client.execute(
            "SELECT has_time FROM channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
        )
        if not meta_result:
            return pd.DataFrame(columns=["time", "value"])

        has_time = bool(meta_result[0][0])

        if has_time:
            query = """
                SELECT toUnixTimestamp(timestamp) as time, value
                FROM sensor_data
                WHERE channel_id = %(channel_id)s
                  AND is_time_series = 1
            """
            params = {"channel_id": channel_id}
            if start_timestamp is not None:
                query += " AND timestamp >= fromUnixTimestamp(%(start_ts)s)"
                params["start_ts"] = start_timestamp
            if end_timestamp is not None:
                query += " AND timestamp <= fromUnixTimestamp(%(end_ts)s)"
                params["end_ts"] = end_timestamp
            query += " ORDER BY timestamp LIMIT %(limit)s"
            params["limit"] = limit
        else:
            query = """
                SELECT sample_index as time, value
                FROM sensor_data
                WHERE channel_id = %(channel_id)s
                  AND is_time_series = 0
            """
            params = {"channel_id": channel_id}
            if start_timestamp is not None:
                query += " AND sample_index >= %(start_idx)s"
                params["start_idx"] = int(start_timestamp)
            if end_timestamp is not None:
                query += " AND sample_index <= %(end_idx)s"
                params["end_idx"] = int(end_timestamp)
            query += " ORDER BY sample_index LIMIT %(limit)s"
            params["limit"] = limit

        result = self.client.execute(query, params)
        return pd.DataFrame(result, columns=["time", "value"])

    def get_time_range(self, channel_id: int) -> Dict[str, Any]:
        """Récupère la plage temporelle d'un channel"""
        meta_result = self.client.execute(
            "SELECT has_time FROM channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
        )
        if not meta_result:
            return {"channel_id": channel_id, "error": "Channel non trouvé"}

        has_time = bool(meta_result[0][0])

        if has_time:
            result = self.client.execute(
                """
                SELECT min(timestamp), max(timestamp), count()
                FROM sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
                """,
                {"channel_id": channel_id},
            )
            if result and result[0] and result[0][0] and result[0][1]:
                min_time, max_time, total_points = result[0]
                return {
                    "channel_id": channel_id,
                    "has_time": True,
                    "min_timestamp": min_time.timestamp(),
                    "max_timestamp": max_time.timestamp(),
                    "min_iso": min_time.isoformat() + "Z",
                    "max_iso": max_time.isoformat() + "Z",
                    "total_points": total_points,
                }
        else:
            result = self.client.execute(
                """
                SELECT min(sample_index), max(sample_index), count()
                FROM sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
                """,
                {"channel_id": channel_id},
            )
            if result and result[0]:
                min_index, max_index, total_points = result[0]
                return {
                    "channel_id": channel_id,
                    "has_time": False,
                    "min_index": min_index,
                    "max_index": max_index,
                    "total_points": total_points,
                }

        return {"channel_id": channel_id, "has_time": has_time, "total_points": 0}

    def get_downsampled_data(
        self,
        channel_id: int,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        points: int = 2000,
    ) -> pd.DataFrame:
        """Downsampling simple côté CH (+ échantillonnage Python)"""

        meta_result = self.client.execute(
            "SELECT has_time FROM channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
        )
        if not meta_result:
            return pd.DataFrame(columns=["time", "value"])
        has_time = bool(meta_result[0][0])

        if has_time:
            query = """
                SELECT toUnixTimestamp(timestamp) as time, value
                FROM sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
                {time_filter}
                ORDER BY timestamp
                LIMIT %(limit)s
            """
            time_filter = ""
            params = {"channel_id": channel_id, "limit": points * 2}
            if start_timestamp is not None:
                time_filter += " AND timestamp >= fromUnixTimestamp(%(start_ts)s)"
                params["start_ts"] = start_timestamp
            if end_timestamp is not None:
                time_filter += " AND timestamp <= fromUnixTimestamp(%(end_ts)s)"
                params["end_ts"] = end_timestamp
            query = query.format(time_filter=time_filter)
        else:
            query = """
                SELECT sample_index as time, value
                FROM sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
                {index_filter}
                ORDER BY sample_index
                LIMIT %(limit)s
            """
            index_filter = ""
            params = {"channel_id": channel_id, "limit": points * 2}
            if start_timestamp is not None:
                index_filter += " AND sample_index >= %(start_idx)s"
                params["start_idx"] = int(start_timestamp)
            if end_timestamp is not None:
                index_filter += " AND sample_index <= %(end_idx)s"
                params["end_idx"] = int(end_timestamp)
            query = query.format(index_filter=index_filter)

        result = self.client.execute(query, params)
        df = pd.DataFrame(result, columns=["time", "value"])

        if len(df) > points:
            step = max(1, len(df) // points)
            df = df.iloc[::step].head(points)

        return df

    # ----------------------
    # Maintenance / Delete
    # ----------------------
    def delete_dataset(self, dataset_id: int):
        """Suppression très rapide via DROP PARTITION + nettoyage des métadonnées"""
        # Supprime toutes les données du dataset en 1 opération
        self.client.execute(
            "ALTER TABLE sensor_data DROP PARTITION %(p)s",
            {"p": int(dataset_id)},
        )
        # Métadonnées
        self.client.execute(
            "ALTER TABLE channels DELETE WHERE dataset_id = %(d)s",
            {"d": int(dataset_id)},
        )
        self.client.execute(
            "ALTER TABLE datasets DELETE WHERE dataset_id = %(d)s",
            {"d": int(dataset_id)},
        )

    def optimize_tables(self):
        """Optimise toutes les tables (optionnel)"""
        try:
            self.client.execute("OPTIMIZE TABLE datasets FINAL")
            self.client.execute("OPTIMIZE TABLE channels FINAL")
            self.client.execute("OPTIMIZE TABLE sensor_data FINAL")
            logger.info("Tables ClickHouse optimisées")
        except Exception as e:
            logger.warning(f"Erreur optimisation: {e}")

    def get_next_channel_id(self) -> int:
        """Récupère le prochain ID de channel disponible"""
        try:
            result = self.client.execute("SELECT max(channel_id) FROM channels")
            return (result[0][0] or 0) + 1
        except Exception:
            return 1


# Instance globale v2
clickhouse_client = ClickHouseClientV2()
