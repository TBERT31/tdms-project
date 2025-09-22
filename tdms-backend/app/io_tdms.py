from nptdms import TdmsFile
import pandas as pd
import numpy as np
import re
import logging
from .clickhouse_client import clickhouse_client

logger = logging.getLogger(__name__)


def safe_filename(name: str) -> str:
    """Remplace les caractères interdits Windows et nettoie la fin"""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", name)
    return name.rstrip(" .")[:200]


def tdms_to_clickhouse(tdms_path: str, dataset_id: int, filename: str):
    """
    Convertit un fichier TDMS directement vers ClickHouse (inserts columnar chunkés)
    """
    logger.info(f"[TDMS→ClickHouse] Début conversion: {filename}")

    tdms = TdmsFile.read(tdms_path)

    channels_data = []
    next_channel_id = clickhouse_client.get_next_channel_id()

    for group in tdms.groups():
        for ch in group.channels():
            logger.info(f"[TDMS→ClickHouse] Traitement: {group.name}/{ch.name}")

            # 1) Valeurs -> numpy (évite listes Python)
            values = ch[:]
            if values is None or len(values) == 0:
                logger.warning(f"Channel {group.name}/{ch.name} vide, ignoré")
                continue
            values_np = np.asarray(values, dtype=np.float64)

            # 2) Timestamps vectorisés si dispo
            has_time = False
            try:
                t = ch.time_track()
                if t is not None:
                    ts_pd = pd.to_datetime(t)  # vectorisé
                    has_time = True
                else:
                    ts_pd = None
            except Exception as e:
                logger.info(f"Pas de timestamps pour {ch.name}: {e}")
                ts_pd = None

            if not has_time:
                # Fallback: indices 0..n-1 en pandas/numpy
                ts_pd = pd.Series(np.arange(len(values_np), dtype=np.uint64))

            # 3) Unité
            unit = ch.properties.get("NI_UnitDescription") or ch.properties.get("unit_string") or ""

            # 4) Préparation des méta + data
            channel_data = {
                "channel_id": next_channel_id,
                "group_name": group.name,
                "channel_name": ch.name,
                "unit": unit,
                "has_time": bool(has_time),
                "timestamps": ts_pd,      # pandas Series (datetime64/ns ou uint64)
                "values": values_np,       # numpy array
                "n_rows": int(values_np.shape[0]),
            }

            channels_data.append(channel_data)
            next_channel_id += 1

    # 5) Insertion batch dans ClickHouse (columnar + chunking)
    if channels_data:
        try:
            clickhouse_client.insert_dataset_data(dataset_id, filename, channels_data)
            logger.info(f"[TDMS→ClickHouse] Dataset {dataset_id} inséré: {len(channels_data)} channels")

            # Optionnel: optimisation post-insert
            clickhouse_client.optimize_tables()

        except Exception as e:
            logger.error(f"Erreur insertion ClickHouse dataset {dataset_id}: {e}")
            raise

    # 6) Métadonnées de réponse (compat ancien format)
    meta = []
    for channel_data in channels_data:
        meta.append(
            {
                "channel_id": channel_data["channel_id"],
                "group": channel_data["group_name"],
                "channel": channel_data["channel_name"],
                "rows": channel_data["n_rows"],
                "has_time": channel_data["has_time"],
                "unit": channel_data["unit"],
            }
        )

    logger.info(f"[TDMS→ClickHouse] Terminé: {len(meta)} channels convertis")
    return meta
