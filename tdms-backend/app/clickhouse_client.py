from clickhouse_driver import Client
from typing import List, Dict, Any, Optional
import pandas as pd
from datetime import datetime
import logging
from .config import settings

logger = logging.getLogger(__name__)

class ClickHouseClientV2:
    def __init__(self):
        """Client ClickHouse v2 avec architecture 3 tables optimisée"""
        self.client = Client(
            host=settings.clickhouse_host,
            port=settings.clickhouse_port,
            database=settings.clickhouse_database,
            user=settings.clickhouse_user,
            password=settings.clickhouse_password
        )
        self.database = settings.clickhouse_database
        self._ensure_database_exists()
        self._create_tables()
    
    def _ensure_database_exists(self):
        """Crée la base de données si elle n'existe pas"""
        try:
            client_admin = Client(
                host=settings.clickhouse_host,
                port=settings.clickhouse_port,
                user=settings.clickhouse_user,
                password=settings.clickhouse_password
            )
            client_admin.execute(f"CREATE DATABASE IF NOT EXISTS {self.database}")
            logger.info(f"Base de données {self.database} créée/vérifiée")
        except Exception as e:
            logger.error(f"Erreur création database: {e}")
            raise
    
    def _create_tables(self):
        """Crée l'architecture 3 tables optimisée"""
        
        # Table 1: Métadonnées des datasets - CORRECTION: UInt64 pour dataset_id
        datasets_table = """
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id UInt64,
                filename String,
                created_at DateTime64(3),
                total_points UInt64
            ) ENGINE = MergeTree()
            ORDER BY dataset_id
        """
        
        # Table 2: Métadonnées des channels - CORRECTION: UInt64 pour dataset_id
        channels_table = """
            CREATE TABLE IF NOT EXISTS channels (
                channel_id UInt32,
                dataset_id UInt64,
                group_name String,
                channel_name String,
                unit String,
                has_time Boolean,
                n_rows UInt64
            ) ENGINE = MergeTree()
            ORDER BY (dataset_id, channel_id)
        """
        
        # Table 3: Données temporelles - CORRECTION: Pas de Nullable dans ORDER BY
        sensor_data_table = """
            CREATE TABLE IF NOT EXISTS sensor_data (
                channel_id UInt32,
                timestamp DateTime64(6) DEFAULT toDateTime64(0, 6),
                sample_index UInt64 DEFAULT 0,
                value Float64,
                is_time_series UInt8 DEFAULT 0
            ) ENGINE = MergeTree()
            PARTITION BY channel_id % 100
            ORDER BY (channel_id, is_time_series, timestamp, sample_index)
            SETTINGS index_granularity = 8192
        """
        
        try:
            self.client.execute(datasets_table)
            self.client.execute(channels_table)
            self.client.execute(sensor_data_table)
            logger.info("Architecture 3 tables ClickHouse créée/vérifiée")
        except Exception as e:
            logger.error(f"Erreur création tables: {e}")
            raise
    
    def insert_dataset_data(self, dataset_id: int, filename: str, channels_data: List[Dict[str, Any]]):
        """Insert un dataset complet avec architecture 3 tables"""
        
        created_at = datetime.utcnow()
        total_points = sum(len(ch["values"]) for ch in channels_data)
        
        # 1. Insérer le dataset
        self.client.execute(
            "INSERT INTO datasets (dataset_id, filename, created_at, total_points) VALUES",
            [(dataset_id, filename, created_at, total_points)]
        )
        
        # 2. Insérer les métadonnées des channels
        channels_meta = []
        sensor_data_batch = []
        
        for channel_data in channels_data:
            channel_id = channel_data["channel_id"]
            group_name = channel_data["group_name"]
            channel_name = channel_data["channel_name"]
            unit = channel_data.get("unit", "")
            has_time = channel_data["has_time"]
            timestamps = channel_data["timestamps"]
            values = channel_data["values"]
            
            # Métadonnées channel
            channels_meta.append((
                channel_id, dataset_id, group_name, 
                channel_name, unit, has_time, len(values)
            ))
            
            # Données de capteur - CORRECTION: is_time_series pour différencier
            if has_time:
                # Avec timestamps - is_time_series = 1
                for ts, val in zip(timestamps, values):
                    sensor_data_batch.append((channel_id, ts, 0, val, 1))
            else:
                # Avec index - is_time_series = 0, utiliser sample_index
                for idx, val in zip(timestamps, values):  # timestamps = indices
                    # timestamp par défaut, sample_index = idx
                    default_ts = datetime.fromtimestamp(0)  # 1970-01-01
                    sensor_data_batch.append((channel_id, default_ts, idx, val, 0))
        
        # Insertion batch des channels
        self.client.execute(
            "INSERT INTO channels (channel_id, dataset_id, group_name, channel_name, unit, has_time, n_rows) VALUES",
            channels_meta
        )
        
        # Insertion batch des données - CORRECTION: nouvel ordre des colonnes
        self.client.execute(
            "INSERT INTO sensor_data (channel_id, timestamp, sample_index, value, is_time_series) VALUES",
            sensor_data_batch
        )
        
        logger.info(f"Dataset {dataset_id} inséré: {len(channels_data)} channels, {total_points} points")
    
    def get_datasets(self) -> List[Dict[str, Any]]:
        """Liste tous les datasets"""
        result = self.client.execute("""
            SELECT dataset_id, filename, created_at, total_points
            FROM datasets 
            ORDER BY created_at DESC
        """)
        
        return [
            {
                "id": row[0],
                "filename": row[1],
                "created_at": row[2],
                "total_points": row[3]
            }
            for row in result
        ]
    
    def get_channels(self, dataset_id: int) -> List[Dict[str, Any]]:
        """Liste les channels d'un dataset"""
        result = self.client.execute("""
            SELECT channel_id, group_name, channel_name, unit, has_time, n_rows
            FROM channels 
            WHERE dataset_id = %(dataset_id)s
            ORDER BY channel_id
        """, {"dataset_id": dataset_id})
        
        return [
            {
                "id": row[0],  # channel_id comme id pour compatibilité frontend
                "channel_id": row[0],
                "dataset_id": dataset_id,
                "group_name": row[1],
                "channel_name": row[2],
                "unit": row[3],
                "has_time": bool(row[4]),
                "n_rows": row[5]
            }
            for row in result
        ]
    
    def get_channel_data(self, channel_id: int, 
                        start_timestamp: Optional[float] = None,
                        end_timestamp: Optional[float] = None,
                        limit: int = 50000) -> pd.DataFrame:
        """Récupère les données d'un channel avec filtres optimisés"""
        
        # Récupérer le type de channel
        meta_result = self.client.execute("""
            SELECT has_time FROM channels WHERE channel_id = %(channel_id)s
        """, {"channel_id": channel_id})
        
        if not meta_result:
            return pd.DataFrame(columns=['time', 'value'])
        
        has_time = bool(meta_result[0][0])
        
        if has_time:
            query = """
                SELECT toUnixTimestamp(timestamp) as time, value
                FROM sensor_data 
                WHERE channel_id = %(channel_id)s 
                AND is_time_series = 1
            """
            params = {'channel_id': channel_id}
            
            if start_timestamp is not None:
                query += ' AND timestamp >= fromUnixTimestamp(%(start_ts)s)'
                params['start_ts'] = start_timestamp
            
            if end_timestamp is not None:
                query += ' AND timestamp <= fromUnixTimestamp(%(end_ts)s)'
                params['end_ts'] = end_timestamp
                
            query += ' ORDER BY timestamp LIMIT %(limit)s'
            params['limit'] = limit
            
        else:
            # CORRECTION: is_time_series = 0 pour les données indexées
            query = """
                SELECT sample_index as time, value
                FROM sensor_data 
                WHERE channel_id = %(channel_id)s 
                AND is_time_series = 0
            """
            params = {'channel_id': channel_id}
            
            if start_timestamp is not None:
                query += ' AND sample_index >= %(start_idx)s'
                params['start_idx'] = int(start_timestamp)
            
            if end_timestamp is not None:
                query += ' AND sample_index <= %(end_idx)s'
                params['end_idx'] = int(end_timestamp)
            
            query += ' ORDER BY sample_index LIMIT %(limit)s'
            params['limit'] = limit
        
        result = self.client.execute(query, params)
        return pd.DataFrame(result, columns=['time', 'value'])
    
    def get_time_range(self, channel_id: int) -> Dict[str, Any]:
        """Récupère la plage temporelle d'un channel"""
        
        # Récupérer le type depuis channels
        meta_result = self.client.execute("""
            SELECT has_time FROM channels WHERE channel_id = %(channel_id)s
        """, {"channel_id": channel_id})
        
        if not meta_result:
            return {"channel_id": channel_id, "error": "Channel non trouvé"}
        
        has_time = bool(meta_result[0][0])
        
        if has_time:
            result = self.client.execute("""
                SELECT 
                    min(timestamp) as min_time,
                    max(timestamp) as max_time,
                    count() as total_points
                FROM sensor_data 
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
            """, {'channel_id': channel_id})
            
            if result and result[0] and result[0][0] and result[0][1]:
                min_time, max_time, total_points = result[0]
                return {
                    "channel_id": channel_id,
                    "has_time": True,
                    "min_timestamp": min_time.timestamp(),
                    "max_timestamp": max_time.timestamp(),
                    "min_iso": min_time.isoformat() + "Z",
                    "max_iso": max_time.isoformat() + "Z",
                    "total_points": total_points
                }
        else:
            # CORRECTION: is_time_series = 0 pour les données indexées
            result = self.client.execute("""
                SELECT 
                    min(sample_index) as min_index,
                    max(sample_index) as max_index,
                    count() as total_points
                FROM sensor_data 
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
            """, {'channel_id': channel_id})
            
            if result and result[0]:
                min_index, max_index, total_points = result[0]
                return {
                    "channel_id": channel_id,
                    "has_time": False,
                    "min_index": min_index,
                    "max_index": max_index,
                    "total_points": total_points
                }
        
        return {"channel_id": channel_id, "has_time": has_time, "total_points": 0}
    
    def get_downsampled_data(self, channel_id: int,
                           start_timestamp: Optional[float] = None,
                           end_timestamp: Optional[float] = None,
                           points: int = 2000) -> pd.DataFrame:
        """Downsampling natif ClickHouse optimisé"""
        
        # Récupérer le type
        meta_result = self.client.execute("""
            SELECT has_time FROM channels WHERE channel_id = %(channel_id)s
        """, {"channel_id": channel_id})
        
        if not meta_result:
            return pd.DataFrame(columns=['time', 'value'])
        
        has_time = bool(meta_result[0][0])
        
        if has_time:
            # Simplification de la requête ClickHouse
            query = """
                SELECT 
                    toUnixTimestamp(timestamp) as time,
                    value
                FROM sensor_data 
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
                {time_filter}
                ORDER BY timestamp
                LIMIT %(limit)s
            """
            
            time_filter = ""
            params = {'channel_id': channel_id, 'limit': points * 2}  # Un peu plus pour pouvoir échantillonner
            
            if start_timestamp is not None:
                time_filter += " AND timestamp >= fromUnixTimestamp(%(start_ts)s)"
                params['start_ts'] = start_timestamp
            
            if end_timestamp is not None:
                time_filter += " AND timestamp <= fromUnixTimestamp(%(end_ts)s)"
                params['end_ts'] = end_timestamp
            
            query = query.format(time_filter=time_filter)
            
        else:
            # CORRECTION: is_time_series = 0 pour les données indexées
            query = """
                SELECT 
                    sample_index as time,
                    value
                FROM sensor_data 
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
                {index_filter}
                ORDER BY sample_index
                LIMIT %(limit)s
            """
            
            index_filter = ""
            params = {'channel_id': channel_id, 'limit': points * 2}
            
            if start_timestamp is not None:
                index_filter += " AND sample_index >= %(start_idx)s"
                params['start_idx'] = int(start_timestamp)
            
            if end_timestamp is not None:
                index_filter += " AND sample_index <= %(end_idx)s"
                params['end_idx'] = int(end_timestamp)
            
            query = query.format(index_filter=index_filter)
        
        result = self.client.execute(query, params)
        df = pd.DataFrame(result, columns=['time', 'value'])
        
        # Downsampling simple côté Python si nécessaire
        if len(df) > points:
            step = len(df) // points
            df = df.iloc[::step].head(points)
        
        return df
    
    def delete_dataset(self, dataset_id: int):
        """Supprime un dataset complet (3 tables)"""
        # Récupérer les channel_ids
        channel_ids = self.client.execute("""
            SELECT channel_id FROM channels WHERE dataset_id = %(dataset_id)s
        """, {"dataset_id": dataset_id})
        
        # Supprimer les données des capteurs
        for (channel_id,) in channel_ids:
            self.client.execute("""
                ALTER TABLE sensor_data DELETE WHERE channel_id = %(channel_id)s
            """, {"channel_id": channel_id})
        
        # Supprimer les métadonnées
        self.client.execute("""
            ALTER TABLE channels DELETE WHERE dataset_id = %(dataset_id)s
        """, {"dataset_id": dataset_id})
        
        self.client.execute("""
            ALTER TABLE datasets DELETE WHERE dataset_id = %(dataset_id)s
        """, {"dataset_id": dataset_id})
    
    def optimize_tables(self):
        """Optimise toutes les tables"""
        try:
            self.client.execute('OPTIMIZE TABLE datasets FINAL')
            self.client.execute('OPTIMIZE TABLE channels FINAL')
            self.client.execute('OPTIMIZE TABLE sensor_data FINAL')
            logger.info("Tables ClickHouse v2 optimisées")
        except Exception as e:
            logger.warning(f"Erreur optimisation: {e}")
    
    def get_next_channel_id(self) -> int:
        """Récupère le prochain ID de channel disponible"""
        try:
            result = self.client.execute('SELECT max(channel_id) FROM channels')
            return (result[0][0] or 0) + 1
        except Exception:
            return 1

# Instance globale v2
clickhouse_client = ClickHouseClientV2()