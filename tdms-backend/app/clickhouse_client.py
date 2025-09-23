from clickhouse_driver import Client
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
import uuid
from datetime import datetime
import logging
from .config import settings

logger = logging.getLogger(__name__)


class ClickHouseClientV2:
    def __init__(self):
        """Client ClickHouse v2 avec architecture UUID + partition par dataset + vues d’audit."""
        self.client = Client(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            database=settings.clickhouse_database,
            user=settings.clickhouse_user,
            password=settings.clickhouse_password,
            compression=True,
            settings={
                "async_insert": 1,
                "wait_for_async_insert": 0,
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
        """Crée les tables (datasets, channels, sensor_data) + tables d’audit + MVs."""
        datasets_table = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.datasets (
                dataset_id   UUID,
                filename     String,
                created_at   DateTime64(3),
                total_points UInt64
            ) ENGINE = MergeTree()
            ORDER BY dataset_id
        """
        channels_table = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.channels (
                channel_id   UUID,
                dataset_id   UUID,
                group_name   String,
                channel_name String,
                unit         String,
                has_time     UInt8,
                n_rows       UInt64
            ) ENGINE = MergeTree()
            ORDER BY (dataset_id, channel_id)
        """
        sensor_data_table = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.sensor_data (
                dataset_id     UUID,
                channel_id     UUID,
                timestamp      DateTime64(6) DEFAULT toDateTime64(0, 6),
                sample_index   UInt64 DEFAULT 0,
                value          Float64,
                is_time_series UInt8 DEFAULT 0
            ) ENGINE = MergeTree()
            PARTITION BY dataset_id
            ORDER BY (channel_id, is_time_series, timestamp, sample_index)
            SETTINGS index_granularity = 8192
        """

        # Audit tables
        audit_channels = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.audit_orphans_channels (
                event_time   DateTime DEFAULT now(),
                dataset_id   UUID,
                channel_id   UUID,
                group_name   String,
                channel_name String
            ) ENGINE = MergeTree()
            ORDER BY event_time
        """
        audit_points = f"""
            CREATE TABLE IF NOT EXISTS {self.database}.audit_orphans_points (
                event_time   DateTime DEFAULT now(),
                dataset_id   UUID,
                channel_id   UUID,
                count_rows   UInt64
            ) ENGINE = MergeTree()
            ORDER BY event_time
        """

        # Materialized Views (idempotent via CREATE IF NOT EXISTS)
        # Note: on utilise LEFT JOIN + IS NULL (compat large).
        mv_orphan_channels = f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {self.database}.mv_orphan_channels_on_insert
            TO {self.database}.audit_orphans_channels AS
            SELECT
              now() AS event_time,
              c.dataset_id,
              c.channel_id,
              c.group_name,
              c.channel_name
            FROM {self.database}.channels AS c
            LEFT JOIN {self.database}.datasets AS d
              ON c.dataset_id = d.dataset_id
            WHERE d.dataset_id IS NULL
        """
        mv_orphan_points = f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {self.database}.mv_orphan_points_on_insert
            TO {self.database}.audit_orphans_points AS
            SELECT
              now() AS event_time,
              s.dataset_id,
              s.channel_id,
              count() AS count_rows
            FROM {self.database}.sensor_data AS s
            LEFT JOIN {self.database}.channels AS c
              ON s.channel_id = c.channel_id
            WHERE c.channel_id IS NULL
            GROUP BY s.dataset_id, s.channel_id
        """

        try:
            self.client.execute(datasets_table)
            self.client.execute(channels_table)
            self.client.execute(sensor_data_table)

            self.client.execute(audit_channels)
            self.client.execute(audit_points)
            self.client.execute(mv_orphan_channels)
            self.client.execute(mv_orphan_points)

            logger.info("Tables + vues d’audit créées/vérifiées (UUID, partition=dataset_id)")
        except Exception as e:
            logger.error(f"Erreur création tables/MVs: {e}")
            raise

    # ----------------------
    # Inserts optimisés (columnar)
    # ----------------------
    def _insert_sensor_data_columnar(
        self,
        columns: List[str],
        rows_dict: Dict[str, Any],
        chunk_rows: int = 250_000  # chunk plus petit: UUID = strings => RAM > int
    ):
        """Insert columnar générique, chunké."""
        lengths = {len(rows_dict[c]) for c in columns}
        if len(lengths) != 1:
            raise ValueError("Toutes les colonnes doivent avoir la même longueur pour l'insert columnar")
        n = lengths.pop()
        if n == 0:
            return

        def _to_list(x):
            if isinstance(x, (pd.Series, np.ndarray)):
                return x.tolist()
            return x

        for start in range(0, n, chunk_rows):
            end = min(start + chunk_rows, n)
            data = []
            for c in columns:
                data.append(_to_list(rows_dict[c][start:end]))
            self.client.execute(
                f"INSERT INTO {self.database}.sensor_data ({', '.join(columns)}) VALUES",
                data,
                columnar=True,
            )

    def _channel_exists(self, channel_id: uuid.UUID) -> bool:
        res = self.client.execute(
            f"SELECT count() FROM {self.database}.channels WHERE channel_id = %(cid)s",
            {"cid": channel_id},
        )
        return bool(res and res[0][0] > 0)

    def insert_dataset_data(self, dataset_id: str, filename: str, channels_data: List[Dict[str, Any]]):
        """Insert complet (datasets + channels + sensor_data), avec validations & chunks."""
        created_at = datetime.utcnow()
        total_points = int(sum(int(ch["n_rows"]) for ch in channels_data))

        # 1) datasets
        self.client.execute(
            f"INSERT INTO {self.database}.datasets (dataset_id, filename, created_at, total_points) VALUES",
            [(dataset_id, filename, created_at, total_points)],
            settings={"async_insert": 0},  # ← sync pour être immédiatement visible
        )
        # 2) channels
        channels_meta = [
            (
                ch["channel_id"],              # UUID objet
                dataset_id,                    # UUID objet
                str(ch["group_name"]),
                str(ch["channel_name"]),
                str(ch.get("unit", "")),
                1 if bool(ch["has_time"]) else 0,
                int(ch["n_rows"]),
            )
            for ch in channels_data
        ]
        self.client.execute(
            f"INSERT INTO {self.database}.channels (channel_id, dataset_id, group_name, channel_name, unit, has_time, n_rows) VALUES",
            channels_meta,
            settings={"async_insert": 0},  # ← sync pour être immédiatement visible
        )
        self.client.execute("SYSTEM FLUSH ASYNC INSERT QUEUE")

        # 3) sensor_data (par channel, séparant time/index)
        for ch in channels_data:
            n = int(ch["n_rows"])
            if n == 0:
                continue

            channel_id = ch["channel_id"]          # UUID objet

            # Validation backend
            if not self._channel_exists(channel_id):
                raise RuntimeError(f"Channel {channel_id} introuvable, insertion sensor_data refusée")

            values = np.asarray(ch["values"], dtype=np.float64)

            if ch["has_time"]:
                ts_pd = pd.to_datetime(ch["timestamps"])
                ts_str = ts_pd.strftime("%Y-%m-%d %H:%M:%S.%f")
                idx_col = np.zeros(n, dtype=np.uint64)
                is_ts = np.ones(n, dtype=np.uint8)

                rows = {
                    "dataset_id": [dataset_id] * n,   # liste d’UUID objets
                    "channel_id": [channel_id] * n,   # liste d’UUID objets
                    "timestamp": ts_str,
                    "sample_index": idx_col,
                    "value": values,
                    "is_time_series": is_ts,
                }
                cols = ["dataset_id", "channel_id", "timestamp", "sample_index", "value", "is_time_series"]
                self._insert_sensor_data_columnar(cols, rows)

            else:
                idx_col = np.asarray(ch["timestamps"], dtype=np.uint64)
                is_ts = np.zeros(n, dtype=np.uint8)

                rows = {
                    "dataset_id": [dataset_id] * n,   # liste d’UUID objets
                    "channel_id": [channel_id] * n,   # liste d’UUID objets
                    "sample_index": idx_col,
                    "value": values,
                    "is_time_series": is_ts,
                }
                cols = ["dataset_id", "channel_id", "sample_index", "value", "is_time_series"]
                self._insert_sensor_data_columnar(cols, rows)

        logger.info(f"Dataset {dataset_id} inséré: {len(channels_data)} channels, {total_points} points")

    # ----------------------
    # Reads
    # ----------------------
    def get_datasets(self) -> List[Dict[str, Any]]:
        result = self.client.execute(
            f"""
            SELECT dataset_id, filename, created_at, total_points
            FROM {self.database}.datasets
            ORDER BY created_at DESC
            """
        )
        return [
            {
                "id": str(row[0]),
                "filename": row[1],
                "created_at": row[2],
                "total_points": row[3],
            }
            for row in result
        ]

    def get_channels(self, dataset_id: str) -> List[Dict[str, Any]]:
        result = self.client.execute(
            f"""
            SELECT channel_id, group_name, channel_name, unit, has_time, n_rows
            FROM {self.database}.channels
            WHERE dataset_id = %(dataset_id)s
            ORDER BY channel_id
            """,
            {"dataset_id": dataset_id},
        )
        return [
            {
                "id": str(row[0]),
                "channel_id": str(row[0]),
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
        channel_id: str,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        limit: int = 50000,
    ) -> pd.DataFrame:
        meta_result = self.client.execute(
            f"SELECT has_time FROM {self.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
        )
        if not meta_result:
            return pd.DataFrame(columns=["time", "value"])

        has_time = bool(meta_result[0][0])

        if has_time:
            query = f"""
                SELECT toUnixTimestamp(timestamp) as time, value
                FROM {self.database}.sensor_data
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
            query = f"""
                SELECT sample_index as time, value
                FROM {self.database}.sensor_data
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

    def get_time_range(self, channel_id: str) -> Dict[str, Any]:
        meta_result = self.client.execute(
            f"SELECT has_time FROM {self.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
        )
        if not meta_result:
            return {"channel_id": channel_id, "error": "Channel non trouvé"}

        has_time = bool(meta_result[0][0])

        if has_time:
            result = self.client.execute(
                f"""
                SELECT min(timestamp), max(timestamp), count()
                FROM {self.database}.sensor_data
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
                f"""
                SELECT min(sample_index), max(sample_index), count()
                FROM {self.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
                """,
                {"channel_id": channel_id},
            )
            if result and result[0]:
                min_index, max_index, total_points = result[0]
                return {
                    "channel_id": channel_id,
                    "has_time": False,
                    "min_index": int(min_index),
                    "max_index": int(max_index),
                    "total_points": int(total_points),
                }

        return {"channel_id": channel_id, "has_time": has_time, "total_points": 0}

    def get_downsampled_data(
        self,
        channel_id: str,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        points: int = 2000,
    ) -> pd.DataFrame:
        meta_result = self.client.execute(
            f"SELECT has_time FROM {self.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
        )
        if not meta_result:
            return pd.DataFrame(columns=["time", "value"])
        has_time = bool(meta_result[0][0])

        if has_time:
            query = f"""
                SELECT toUnixTimestamp(timestamp) as time, value
                FROM {self.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
                {{time_filter}}
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
            query = f"""
                SELECT sample_index as time, value
                FROM {self.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
                {{index_filter}}
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
    def delete_dataset(self, dataset_id: uuid.UUID):
        self.client.execute(
            f"ALTER TABLE {self.database}.sensor_data DROP PARTITION %(p)s",
            {"p": dataset_id},
        )
        self.client.execute(
            f"ALTER TABLE {self.database}.channels DELETE WHERE dataset_id = %(d)s",
            {"d": dataset_id},
        )
        self.client.execute(
            f"ALTER TABLE {self.database}.datasets DELETE WHERE dataset_id = %(d)s",
            {"d": dataset_id},
        )

    def optimize_tables(self):
        try:
            self.client.execute(f"OPTIMIZE TABLE {self.database}.datasets FINAL")
            self.client.execute(f"OPTIMIZE TABLE {self.database}.channels FINAL")
            self.client.execute(f"OPTIMIZE TABLE {self.database}.sensor_data FINAL")
            logger.info("Tables ClickHouse optimisées")
        except Exception as e:
            logger.warning(f"Erreur optimisation: {e}")

    # UUIDs → on ne compte plus sur un “max+1”
    def new_dataset_id(self) -> str:
        return str(uuid.uuid4())

    def new_channel_id(self) -> str:
        return str(uuid.uuid4())


clickhouse_client = ClickHouseClientV2()
