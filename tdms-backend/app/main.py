from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, create_engine, Session, select
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np
import pyarrow.parquet as pq
from .lttb import smart_downsample_production
import pyarrow as pa
import pyarrow.compute as pc
from datetime import datetime as dt

from .models import Dataset, Channel
from .io_tdms import tdms_to_parquet

DB_URL = "sqlite:///db.sqlite"
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)

app = FastAPI(title="TDMS → Parquet API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

@app.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    # Sauvegarde temporaire
    tmp_path = Path("tmp") / f"{datetime.utcnow().timestamp()}_{file.filename}"
    tmp_path.parent.mkdir(exist_ok=True)
    content = await file.read()
    tmp_path.write_bytes(content)

    # Convertit en Parquet + métadonnées
    out_dir = DATA_DIR / tmp_path.stem
    meta = tdms_to_parquet(str(tmp_path), str(out_dir))
    tmp_path.unlink()

    # Enregistre en DB
    # ⬇️ IMPORTANT: expire_on_commit=False pour éviter le DetachedInstanceError
    with Session(engine, expire_on_commit=False) as s:
        ds = Dataset(filename=file.filename)
        s.add(ds)
        s.commit()
        s.refresh(ds)
        ds_id = ds.id  # on le capture tout de suite

        for m in meta:
            ch = Channel(
                dataset_id=ds_id,
                group_name=m["group"],
                channel_name=m["channel"],
                n_rows=m["rows"],
                parquet_path=m["parquet"],
                has_time=m["has_time"],
                unit=m["unit"],
            )
            s.add(ch)
        s.commit()

    return {"dataset_id": ds_id, "channels": meta}

@app.get("/datasets")
def list_datasets():
    with Session(engine) as s:
        return s.exec(select(Dataset)).all()

@app.get("/datasets/{dataset_id}/channels")
def list_channels(dataset_id: int):
    with Session(engine) as s:
        return s.exec(select(Channel).where(Channel.dataset_id == dataset_id)).all()

@app.get("/window")
def get_window(
    channel_id: int = Query(...),
    start: str | None = Query(None, description="ISO datetimes si has_time"),
    end: str | None = Query(None, description="ISO datetimes si has_time"),
    start_sec: float | None = Query(None, description="fenêtre relative en secondes"),
    end_sec: float | None = Query(None, description="fenêtre relative en secondes"),
    relative: bool = Query(False, description="temps en secondes depuis le début"),
    points: int = Query(2000, ge=10, le=20000),
    method: str = Query("lttb", description="lttb|uniform - LTTB par défaut"),
):
    with Session(engine) as s:
        ch = s.get(Channel, channel_id)
        if not ch:
            raise HTTPException(404, "Channel not found")

    df = pq.read_table(ch.parquet_path).to_pandas()

    if ch.has_time:
        df["time"] = pd.to_datetime(df["time"])

        if relative:
            df["sec"] = (df["time"] - df["time"].iloc[0]).dt.total_seconds()

            # Filtrage temporel
            if start_sec is not None:
                df = df[df["sec"] >= float(start_sec)]
            if end_sec is not None:
                df = df[df["sec"] <= float(end_sec)]

            df_clean = df[["sec", "value"]].rename(columns={"sec": "time"})
            
            # Downsampling avec choix de méthode
            if len(df_clean) > points:
                if method == "lttb":
                    df_sampled = smart_downsample_production(df_clean, points)
                else:  # uniform
                    bins = np.linspace(0, len(df_clean)-1, points, dtype=int)
                    df_sampled = df_clean.iloc[bins]
            else:
                df_sampled = df_clean

            return {
                "x": df_sampled["time"].astype(float).tolist(),
                "y": df_sampled["value"].astype(float).tolist(),
                "unit": ch.unit,
                "has_time": True,
                "x_unit": "s",
                "method": method,
                "original_points": len(df),
                "returned_points": len(df_sampled)
            }

        # Mode datetimes absolus
        if start: df = df[df["time"] >= pd.to_datetime(start)]
        if end:   df = df[df["time"] <= pd.to_datetime(end)]
        
        df_clean = df[["time", "value"]]
        
        if len(df_clean) > points:
            if method == "lttb":
                df_sampled = smart_downsample_production(df_clean, points)
            else:  # uniform
                bins = np.linspace(0, len(df_clean)-1, points, dtype=int)
                df_sampled = df_clean.iloc[bins]
        else:
            df_sampled = df_clean
            
        return {
            "x": df_sampled["time"].astype("datetime64[ms]").dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ").tolist(),
            "y": df_sampled["value"].astype(float).tolist(),
            "unit": ch.unit,
            "has_time": True,
            "method": method,
            "original_points": len(df),
            "returned_points": len(df_sampled)
        }

    # Cas sans horodatage (une seule fois)
    df_clean = df[["time", "value"]]
    
    if start: df_clean = df_clean[df_clean["time"] >= int(start)]
    if end:   df_clean = df_clean[df_clean["time"] <= int(end)]
    
    if len(df_clean) > points:
        if method == "lttb":
            df_sampled = smart_downsample_production(df_clean, points)
        else:  # uniform
            bins = np.linspace(0, len(df_clean)-1, points, dtype=int)
            df_sampled = df_clean.iloc[bins]
    else:
        df_sampled = df_clean
    
    return {
        "x": df_sampled["time"].astype(int).tolist(),
        "y": df_sampled["value"].astype(float).tolist(),
        "unit": ch.unit,
        "has_time": False,
        "method": method,
        "original_points": len(df),
        "returned_points": len(df_sampled)
    }

@app.get("/dataset_meta")
def dataset_meta(dataset_id: int):
    # On récupère UN canal pour retrouver le dossier "data/<stem>"
    with Session(engine) as s:
        ch = s.exec(select(Channel).where(Channel.dataset_id == dataset_id)).first()
        if not ch:
            raise HTTPException(404, "Dataset not found")
    meta_path = Path(ch.parquet_path).parent / "_meta.json"
    if not meta_path.exists():
        # pas de meta.json -> renvoyer quelque chose de minimal
        return {"file_properties": {}, "group_properties": {}, "channels": []}
    return json.loads(meta_path.read_text(encoding="utf-8"))


@app.get("/multi_window")
def multi_window(
    channel_ids: str,
    points: int = Query(2000, ge=10, le=20000),
    agg: str = Query("mean", description="mean|max|min")
):
    ids = [int(x) for x in channel_ids.split(",") if x.strip()]
    series = []

    with Session(engine) as s:
        for cid in ids:
            ch = s.get(Channel, cid)
            if not ch:
                continue
            df = pq.read_table(ch.parquet_path).to_pandas()

            if len(df) > points:
                bins = np.linspace(0, len(df)-1, points+1, dtype=int)
                take = []
                for i in range(len(bins)-1):
                    seg = df.iloc[bins[i]:bins[i+1]]
                    if len(seg) == 0:
                        continue
                    if agg == "max":
                        row = seg.loc[seg["value"].idxmax()]
                    elif agg == "min":
                        row = seg.loc[seg["value"].idxmin()]
                    else:
                        row = seg.iloc[[0]].assign(value=seg["value"].mean()).iloc[0]
                    take.append(row)
                df = pd.DataFrame(take)

            if ch.has_time:
                x = pd.to_datetime(df["time"]).astype("datetime64[ms]").dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ").tolist()
            else:
                x = df["time"].astype(int).tolist()

            series.append({
                "name": f"{ch.group_name} / {ch.channel_name} (ds{ch.dataset_id})",
                "x": x,
                "y": df["value"].astype(float).tolist()
            })

    return {"series": series}

@app.get("/get_window_filtered")
def get_window_filtered(
    channel_id: int = Query(...),
    # Fenêtrage temporel avec timestamps Unix (plus efficace)
    start_timestamp: float | None = Query(None, description="Timestamp Unix de début (secondes)"),
    end_timestamp: float | None = Query(None, description="Timestamp Unix de fin (secondes)"), 
    # Pagination avec curseur (plus efficace qu'offset)
    cursor: float | None = Query(None, description="Curseur temporel pour pagination"),
    limit: int = Query(50000, le=200000, description="Limite de points avant downsampling"),
    # Downsampling
    points: int = Query(2000, ge=10, le=20000, description="Points après downsampling"),
    method: str = Query("lttb", description="lttb|uniform - LTTB par défaut"),
):
    """
    Route optimisée avec fenêtrage strict PyArrow.
    
    Avantages vs /window:
    - Filtrage AVANT lecture complète (PyArrow filters)
    - Pagination par curseur temporel (plus efficace)
    - Limitation précoce pour éviter surcharge mémoire
    - Compatible LTTB
    
    Usage:
    1. Appel initial: /window_v2?channel_id=1&start_timestamp=1640995200&points=2000
    2. Pagination: utiliser next_cursor retourné
    """
    
    # 1. Récupération du channel
    with Session(engine) as s:
        ch = s.get(Channel, channel_id)
        if not ch:
            raise HTTPException(404, "Channel not found")
    
    # 2. Construction des filtres PyArrow (TRÈS EFFICACE)
    filters = []
    
    # Filtrage temporel si le channel a des timestamps
    if ch.has_time:
        if start_timestamp is not None:
            # Convertir timestamp Unix en format PyArrow
            start_ts = pa.scalar(int(start_timestamp * 1_000_000), type=pa.timestamp('us'))
            filters.append(('time', '>=', start_ts))
        
        if end_timestamp is not None:
            end_ts = pa.scalar(int(end_timestamp * 1_000_000), type=pa.timestamp('us'))
            filters.append(('time', '<=', end_ts))
        
        # Curseur pour pagination efficace
        if cursor is not None:
            cursor_ts = pa.scalar(int(cursor * 1_000_000), type=pa.timestamp('us'))
            filters.append(('time', '>', cursor_ts))
    
    else:
        # Cas sans timestamps (index numérique)
        if start_timestamp is not None:
            filters.append(('time', '>=', int(start_timestamp)))
        if end_timestamp is not None:
            filters.append(('time', '<=', int(end_timestamp)))
        if cursor is not None:
            filters.append(('time', '>', int(cursor)))
    
    # 3. Lecture optimisée avec PyArrow (FILTRAGE PUSH-DOWN)
    try:
        if filters:
            # Lecture avec filtres (très efficace, ne lit que les données nécessaires)
            table = pq.read_table(
                ch.parquet_path,
                columns=['time', 'value'],  # Seulement les colonnes nécessaires
                filters=filters,
                use_threads=True  # Parallélisation
            )
        else:
            # Lecture complète si pas de filtres
            table = pq.read_table(
                ch.parquet_path,
                columns=['time', 'value']
            )
    
    except Exception as e:
        raise HTTPException(500, f"Erreur lecture Parquet: {str(e)}")
    
    # 4. Limitation précoce pour éviter surcharge mémoire
    original_count = len(table)
    has_more = False
    
    if original_count > limit:
        # Trier par temps et prendre les premiers `limit` points
        if ch.has_time:
            indices = pc.sort_indices(table['time'])
        else:
            indices = pc.sort_indices(table['time'])
        
        table = table.take(indices.slice(0, limit))
        has_more = True
        limited_count = limit
    else:
        limited_count = original_count
    
    # 5. Conversion en DataFrame pour LTTB
    if len(table) == 0:
        return {
            "x": [], "y": [], "unit": ch.unit, "has_time": ch.has_time,
            "original_points": 0, "sampled_points": 0, 
            "has_more": False, "next_cursor": None,
            "method": method, "performance": {"filtered_points": 0, "limited_points": 0}
        }
    
    df = table.to_pandas()
    
    # 6. Préparation pour LTTB
    if ch.has_time:
        # Convertir timestamps en float pour LTTB
        df['time_float'] = df['time'].astype('int64') / 1_000_000  # Unix seconds
        df_clean = df[['time_float', 'value']].rename(columns={'time_float': 'time'})
    else:
        df_clean = df[['time', 'value']]
    
    # 7. Downsampling avec LTTB (algorithme éprouvé)
    if len(df_clean) > points:
        if method == "lttb":
            df_sampled = smart_downsample_production(df_clean, points)
        else:  # uniform
            bins = np.linspace(0, len(df_clean)-1, points, dtype=int)
            df_sampled = df_clean.iloc[bins]
    else:
        df_sampled = df_clean
    
    # 8. Calcul du curseur suivant pour pagination
    next_cursor = None
    if has_more and len(df_sampled) > 0:
        # Utiliser le dernier timestamp comme curseur
        next_cursor = float(df_sampled['time'].iloc[-1])
    
    # 9. Préparation de la réponse
    if ch.has_time:
        # Retourner en timestamps Unix pour uniformité
        x_data = df_sampled['time'].astype(float).tolist()
    else:
        x_data = df_sampled['time'].astype(int).tolist()
    
    return {
        "x": x_data,
        "y": df_sampled['value'].astype(float).tolist(),
        "unit": ch.unit,
        "has_time": ch.has_time,
        "original_points": original_count,
        "sampled_points": len(df_sampled),
        "has_more": has_more,
        "next_cursor": next_cursor,
        "method": method,
        "performance": {
            "filtered_points": original_count,
            "limited_points": limited_count,
            "optimization": "pyarrow_pushdown_filtering"
        }
    }


# Route utilitaire pour conversion timestamp
@app.get("/timestamp_helpers")
def timestamp_helpers(
    iso_date: str | None = Query(None, description="Date ISO à convertir (ex: 2024-01-01T10:00:00Z)"),
    unix_timestamp: float | None = Query(None, description="Timestamp Unix à convertir"),
):
    """
    Utilitaire pour conversion entre formats de timestamp.
    
    Exemples:
    - /timestamp_helpers?iso_date=2024-01-01T10:00:00Z
    - /timestamp_helpers?unix_timestamp=1704106800
    """
    
    result = {}
    
    if iso_date:
        try:
            parsed_date = dt.fromisoformat(iso_date.replace('Z', '+00:00'))
            result["iso_to_unix"] = parsed_date.timestamp()
        except ValueError as e:
            result["iso_error"] = f"Format invalide: {str(e)}"
    
    if unix_timestamp:
        try:
            parsed_timestamp = dt.fromtimestamp(unix_timestamp)
            result["unix_to_iso"] = parsed_timestamp.isoformat() + "Z"
        except (ValueError, OSError) as e:
            result["unix_error"] = f"Timestamp invalide: {str(e)}"
    
    # Exemples pour aider l'utilisateur
    now = dt.now()
    result["examples"] = {
        "current_unix": now.timestamp(),
        "current_iso": now.isoformat() + "Z",
        "usage": "Utilisez ces valeurs dans start_timestamp/end_timestamp de /window_v2"
    }
    
    return result


# Route de métadonnées temporelles pour un channel
@app.get("/channels/{channel_id}/time_range")
def get_channel_time_range(channel_id: int):
    """
    Récupère la plage temporelle d'un channel (min/max timestamps).
    Utile pour déterminer les bornes pour /window_v2.
    """
    
    with Session(engine) as s:
        ch = s.get(Channel, channel_id)
        if not ch:
            raise HTTPException(404, "Channel not found")
    
    try:
        # Lecture optimisée : seulement la colonne time
        table = pq.read_table(ch.parquet_path, columns=['time'])
        
        if len(table) == 0:
            return {
                "channel_id": channel_id,
                "has_time": ch.has_time,
                "error": "Aucune donnée dans le channel"
            }
        
        if ch.has_time:
            # Calcul min/max avec PyArrow (très efficace)
            time_col = table['time']
            min_time = pc.min(time_col).as_py()
            max_time = pc.max(time_col).as_py()
            
            # Conversion en timestamps Unix
            min_unix = min_time.timestamp() if min_time else None
            max_unix = max_time.timestamp() if max_time else None
            
            return {
                "channel_id": channel_id,
                "has_time": True,
                "min_timestamp": min_unix,
                "max_timestamp": max_unix,
                "min_iso": min_time.isoformat() + "Z" if min_time else None,
                "max_iso": max_time.isoformat() + "Z" if max_time else None,
                "total_points": len(table),
                "usage": f"Utilisez start_timestamp entre {min_unix} et {max_unix} dans /window_v2"
            }
        else:
            # Données indexées numériquement
            time_col = table['time']
            min_idx = pc.min(time_col).as_py()
            max_idx = pc.max(time_col).as_py()
            
            return {
                "channel_id": channel_id,
                "has_time": False,
                "min_index": min_idx,
                "max_index": max_idx,
                "total_points": len(table),
                "usage": f"Utilisez start_timestamp entre {min_idx} et {max_idx} dans /window_v2"
            }
    
    except Exception as e:
        raise HTTPException(500, f"Erreur lecture métadonnées: {str(e)}")