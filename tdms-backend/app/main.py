from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np
from .lttb import smart_downsample_production
from datetime import datetime as dt
import logging
import uuid

from .io_tdms import tdms_to_clickhouse
from .config import settings, get_api_constraints
from .clickhouse_client import clickhouse_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TDMS → ClickHouse API (UUID)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------
# Constraints
# ----------------------
@app.get("/api/constraints")
def api_constraints():
    return get_api_constraints()

# ----------------------
# Ingestion
# ----------------------
@app.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    tmp_path = Path("tmp") / f"{datetime.utcnow().timestamp()}_{file.filename}"
    tmp_path.parent.mkdir(exist_ok=True)

    try:
        content = await file.read()
        tmp_path.write_bytes(content)

        dataset_uuid = uuid.uuid4()  

        logger.info(f"Début conversion TDMS → ClickHouse pour dataset {dataset_uuid}")

        meta = tdms_to_clickhouse(str(tmp_path), dataset_uuid, file.filename)

        logger.info(f"Ingestion terminée: {len(meta)} channels")

        return {"dataset_id": str(dataset_uuid), "channels": meta}

    except Exception as e:
        logger.error(f"Erreur ingestion: {e}")
        raise HTTPException(500, f"Erreur ingestion: {str(e)}")
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                pass

# ----------------------
# Listings
# ----------------------
@app.get("/datasets")
def list_datasets():
    try:
        return clickhouse_client.get_datasets()
    except Exception as e:
        logger.error(f"Erreur récupération datasets: {e}")
        raise HTTPException(500, f"Erreur ClickHouse: {str(e)}")

@app.get("/datasets/{dataset_id}/channels")
def list_channels(dataset_id: str):
    try:
        return clickhouse_client.get_channels(dataset_id)
    except Exception as e:
        logger.error(f"Erreur récupération channels: {e}")
        raise HTTPException(500, f"Erreur ClickHouse: {str(e)}")

# ----------------------
# Data windows
# ----------------------
@app.get("/window")
def get_window(
    channel_id: str = Query(...),
    start: str | None = Query(None, description="ISO datetimes si has_time"),
    end: str | None = Query(None, description="ISO datetimes si has_time"),
    start_sec: float | None = Query(None, description="fenêtre relative en secondes"),
    end_sec: float | None = Query(None, description="fenêtre relative en secondes"),
    relative: bool = Query(False, description="temps en secondes depuis le début"),
    points: int = Query(settings.default_points, ge=settings.points_min, le=settings.points_max),
    method: str = Query("lttb", description="lttb|uniform|clickhouse - LTTB par défaut"),
):
    try:
        time_range = clickhouse_client.get_time_range(channel_id)
        if "error" in time_range:
            raise HTTPException(404, "Channel not found")

        has_time = time_range["has_time"]
        start_timestamp = None
        end_timestamp = None

        if has_time:
            if start:
                start_timestamp = dt.fromisoformat(start.replace("Z", "+00:00")).timestamp()
            elif start_sec is not None and "min_timestamp" in time_range:
                start_timestamp = time_range["min_timestamp"] + start_sec

            if end:
                end_timestamp = dt.fromisoformat(end.replace("Z", "+00:00")).timestamp()
            elif end_sec is not None and "min_timestamp" in time_range:
                end_timestamp = time_range["min_timestamp"] + end_sec
        else:
            if start:
                start_timestamp = float(start)
            if end:
                end_timestamp = float(end)

        if method == "clickhouse":
            df = clickhouse_client.get_downsampled_data(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                points=points,
            )
            original_points = points
        else:
            df = clickhouse_client.get_channel_data(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                limit=settings.default_limit,
            )
            original_points = len(df)
            if len(df) > points:
                if method == "lttb":
                    df = smart_downsample_production(df, points)
                else:
                    bins = np.linspace(0, len(df) - 1, points, dtype=int)
                    df = df.iloc[bins]

        if len(df) == 0:
            return {
                "x": [],
                "y": [],
                "unit": "",
                "has_time": has_time,
                "method": method,
                "original_points": 0,
                "returned_points": 0,
            }

        unit_result = clickhouse_client.client.execute(
            f"SELECT unit FROM {settings.clickhouse_database}.channels WHERE channel_id = %(channel_id)s LIMIT 1",
            {"channel_id": channel_id},
        )
        unit = unit_result[0][0] if unit_result else ""

        if relative and has_time:
            min_time = df["time"].min()
            df["time"] = df["time"] - min_time

        return {
            "x": df["time"].astype(float if has_time else int).tolist(),
            "y": df["value"].astype(float).tolist(),
            "unit": unit,
            "has_time": has_time,
            "x_unit": "s" if relative else "",
            "method": method,
            "original_points": original_points,
            "returned_points": len(df),
        }

    except Exception as e:
        logger.error(f"Erreur endpoint window: {e}")
        raise HTTPException(500, f"Erreur ClickHouse: {str(e)}")

@app.get("/get_window_filtered")
def get_window_filtered(
    channel_id: str = Query(...),
    start_timestamp: float | None = Query(None, description="Timestamp Unix de début"),
    end_timestamp: float | None = Query(None, description="Timestamp Unix de fin"),
    cursor: float | None = Query(None, description="Curseur temporel pour pagination"),
    limit: int = Query(settings.default_limit, ge=settings.limit_min, le=settings.limit_max),
    points: int = Query(settings.default_points, ge=settings.points_min, le=settings.points_max),
    method: str = Query("lttb", description="lttb|uniform|clickhouse - LTTB par défaut"),
):
    try:
        time_range = clickhouse_client.get_time_range(channel_id)
        if "error" in time_range:
            raise HTTPException(404, "Channel not found")

        if cursor is not None:
            start_timestamp = cursor

        if method == "clickhouse":
            df = clickhouse_client.get_downsampled_data(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                points=points,
            )
            original_points = points
            has_more = False
            next_cursor = None
        else:
            df = clickhouse_client.get_channel_data(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                limit=limit,
            )
            original_points = len(df)
            has_more = len(df) >= limit

            if len(df) > points:
                if method == "lttb":
                    df = smart_downsample_production(df, points)
                else:
                    bins = np.linspace(0, len(df) - 1, points, dtype=int)
                    df = df.iloc[bins]

            next_cursor = float(df["time"].iloc[-1]) if len(df) > 0 and has_more else None

        unit_result = clickhouse_client.client.execute(
            f"SELECT unit FROM {settings.clickhouse_database}.channels WHERE channel_id = %(channel_id)s LIMIT 1",
            {"channel_id": channel_id},
        )
        unit = unit_result[0][0] if unit_result else ""

        if len(df) == 0:
            return {
                "x": [],
                "y": [],
                "unit": unit,
                "has_time": time_range["has_time"],
                "original_points": 0,
                "sampled_points": 0,
                "has_more": False,
                "next_cursor": None,
                "method": method,
                "performance": {"optimization": "clickhouse_native"},
            }

        return {
            "x": df["time"].astype(float if time_range["has_time"] else int).tolist(),
            "y": df["value"].astype(float).tolist(),
            "unit": unit,
            "has_time": time_range["has_time"],
            "original_points": original_points,
            "sampled_points": len(df),
            "has_more": has_more,
            "next_cursor": next_cursor,
            "method": method,
            "performance": {
                "optimization": "clickhouse_native_query" if method == "clickhouse" else "python_downsample",
                "filtered_points": original_points,
                "limited_points": len(df),
            },
        }

    except Exception as e:
        logger.error(f"Erreur window filtré: {e}")
        raise HTTPException(500, f"Erreur ClickHouse: {str(e)}")

# ----------------------
# Time range & Utils
# ----------------------
@app.get("/channels/{channel_id}/time_range")
def get_channel_time_range(channel_id: str):
    try:
        return clickhouse_client.get_time_range(channel_id)
    except Exception as e:
        logger.error(f"Erreur time range: {e}")
        raise HTTPException(500, f"Erreur ClickHouse: {str(e)}")

@app.get("/dataset_meta")
def dataset_meta(dataset_id: str):
    try:
        channels = clickhouse_client.get_channels(dataset_id)
        if not channels:
            raise HTTPException(404, "Dataset not found")

        channel_info = []
        for ch in channels:
            channel_info.append(
                {
                    "channel_id": ch["channel_id"],
                    "group": ch["group_name"],
                    "channel": ch["channel_name"],
                    "rows": ch["n_rows"],
                    "has_time": ch["has_time"],
                    "unit": ch["unit"],
                }
            )

        return {
            "dataset_id": dataset_id,
            "channels": channel_info,
            "total_channels": len(channels),
            "storage": "clickhouse_partitioned_by_dataset_uuid",
        }

    except Exception as e:
        logger.error(f"Erreur dataset_meta: {e}")
        raise HTTPException(500, f"Erreur ClickHouse: {str(e)}")

# ----------------------
# Health
# ----------------------
@app.get("/health")
def health_check():
    try:
        clickhouse_client.client.execute("SELECT 1")
        clickhouse_status = "OK"
        expected_tables = {"datasets", "channels", "sensor_data", "audit_orphans_channels", "audit_orphans_points"}
        tables_result = clickhouse_client.client.execute("SHOW TABLES")
        found_tables = {t[0] for t in tables_result}
        table_count = len(expected_tables.intersection(found_tables))
    except Exception as e:
        clickhouse_status = f"ERROR: {str(e)}"
        found_tables = set()
        table_count = 0

    return {
        "status": "healthy" if clickhouse_status == "OK" and {"datasets", "channels", "sensor_data"} <= found_tables else "degraded",
        "clickhouse": clickhouse_status,
        "tables": f"{table_count}/{len({'datasets','channels','sensor_data','audit_orphans_channels','audit_orphans_points'})} expected tables found: {found_tables}",
        "architecture": "ClickHouse (UUID ids, partition=dataset_id, columnar inserts, audit MVs)",
        "timestamp": dt.utcnow().isoformat() + "Z",
    }
