from nptdms import TdmsFile
import pandas as pd
import numpy as np
import uuid
import re
import logging
from .clickhouse_client import clickhouse_client

logger = logging.getLogger(__name__)


def safe_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", name)
    return name.rstrip(" .")[:200]


def tdms_to_clickhouse(tdms_path: str, dataset_id: str, filename: str):
    """
    Convertit un fichier TDMS → ClickHouse (UUID, inserts columnar chunkés).
    """
    logger.info(f"[TDMS→ClickHouse] Début conversion: {filename}")

    tdms = TdmsFile.read(tdms_path)

    channels_data = []
    for group in tdms.groups():
        for ch in group.channels():
            logger.info(f"[TDMS→ClickHouse] Traitement: {group.name}/{ch.name}")

            values = ch[:]
            if values is None or len(values) == 0:
                logger.warning(f"Channel {group.name}/{ch.name} vide, ignoré")
                continue
            values_np = np.asarray(values, dtype=np.float64)

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
                ts_pd = pd.Series(np.arange(len(values_np), dtype=np.uint64))

            unit = ch.properties.get("NI_UnitDescription") or ch.properties.get("unit_string") or ""

            channel_data = {
                "channel_id": uuid.uuid4(),  # UUID par channel
                "group_name": group.name,
                "channel_name": ch.name,
                "unit": unit,
                "has_time": bool(has_time),
                "timestamps": ts_pd,
                "values": values_np,
                "n_rows": int(values_np.shape[0]),
            }
            channels_data.append(channel_data)

    if channels_data:
        try:
            clickhouse_client.insert_dataset_data(dataset_id, filename, channels_data)
            logger.info(f"[TDMS→ClickHouse] Dataset {dataset_id} inséré: {len(channels_data)} channels")
            clickhouse_client.optimize_tables()
        except Exception as e:
            logger.error(f"Erreur insertion ClickHouse dataset {dataset_id}: {e}")
            raise

    meta = []
    for ch in channels_data:
        meta.append(
            {
                "channel_id": ch["channel_id"],
                "group": ch["group_name"],
                "channel": ch["channel_name"],
                "rows": ch["n_rows"],
                "has_time": ch["has_time"],
                "unit": ch["unit"],
            }
        )
    logger.info(f"[TDMS→ClickHouse] Terminé: {len(meta)} channels convertis")
    return meta
