from nptdms import TdmsFile
import pandas as pd
import re
import logging
from .clickhouse_client import clickhouse_client

logger = logging.getLogger(__name__)

def safe_filename(name: str) -> str:
    """Remplace les caractères interdits Windows et nettoie la fin"""
    # Interdits: < > : " / \ | ? *  + contrôles 0x00-0x1F
    name = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", name)
    # Windows n'accepte pas "." ou " " final
    name = name.rstrip(" .")
    # Longueurs de chemin: on coupe large pour éviter 260+ chars
    return name[:200]

def tdms_to_clickhouse(tdms_path: str, dataset_id: int, filename: str):
    """
    Convertit un fichier TDMS directement vers ClickHouse unifié
    """
    logger.info(f"[TDMS→ClickHouse] Début conversion: {filename}")
    
    tdms = TdmsFile.read(tdms_path)
    
    channels_data = []
    next_channel_id = clickhouse_client.get_next_channel_id()
    
    for group in tdms.groups():
        for ch in group.channels():
            logger.info(f"[TDMS→ClickHouse] Traitement: {group.name}/{ch.name}")
            
            # 1) Récupération des valeurs
            values = ch[:]
            if len(values) == 0:
                logger.warning(f"Channel {group.name}/{ch.name} vide, ignoré")
                continue
            
            # 2) Gestion du temps
            has_time = False
            timestamps = None
            
            try:
                t = ch.time_track()
                if t is not None:
                    # Conversion en timestamps datetime Python pour ClickHouse
                    timestamps = pd.to_datetime(t).to_pydatetime().tolist()
                    has_time = True
                    logger.info(f"Channel avec timestamps: {len(timestamps)} points")
            except Exception as e:
                logger.info(f"Pas de timestamps pour {ch.name}: {e}")
            
            # Fallback: indices numériques
            if not has_time:
                timestamps = list(range(len(values)))
                logger.info(f"Channel avec indices: {len(timestamps)} points")
            
            # 3) Récupération de l'unité
            unit = ch.properties.get("NI_UnitDescription") or ch.properties.get("unit_string") or ""
            
            # 4) Préparation des données pour insertion
            channel_data = {
                "channel_id": next_channel_id,
                "group_name": group.name,
                "channel_name": ch.name,
                "unit": unit,
                "has_time": has_time,
                "timestamps": timestamps,
                "values": values.tolist(),
                "n_rows": len(values)
            }
            
            channels_data.append(channel_data)
            next_channel_id += 1
    
    # 5) Insertion batch dans ClickHouse
    if channels_data:
        try:
            clickhouse_client.insert_dataset_data(dataset_id, filename, channels_data)
            logger.info(f"[TDMS→ClickHouse] Dataset {dataset_id} inséré: {len(channels_data)} channels")
            
            # Optimisation après insertion
            clickhouse_client.optimize_tables()
            
        except Exception as e:
            logger.error(f"Erreur insertion ClickHouse dataset {dataset_id}: {e}")
            raise
    
    # 6) Métadonnées de réponse (compatibilité avec l'ancien format)
    meta = []
    for channel_data in channels_data:
        meta.append({
            "channel_id": channel_data["channel_id"],
            "group": channel_data["group_name"],
            "channel": channel_data["channel_name"],
            "rows": channel_data["n_rows"],
            "has_time": channel_data["has_time"],
            "unit": channel_data["unit"],
        })
    
    logger.info(f"[TDMS→ClickHouse] Terminé: {len(meta)} channels convertis")
    return meta