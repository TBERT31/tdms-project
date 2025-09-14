from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, create_engine, Session, select
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np
import pyarrow.parquet as pq

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
    start: str | None = Query(None, description="ISO datetimes si has_time, sinon entier minimal"),
    end: str | None = Query(None, description="ISO datetimes si has_time, sinon entier maximal"),
    points: int = Query(2000, ge=10, le=20000, description="downsampling cible"),
    agg: str = Query("mean", description="mean|max|min")
):
    with Session(engine) as s:
        ch = s.get(Channel, channel_id)
        if not ch:
            raise HTTPException(404, "Channel not found")

    df = pq.read_table(ch.parquet_path).to_pandas()

    if ch.has_time:
        df["time"] = pd.to_datetime(df["time"])
        if start: df = df[df["time"] >= pd.to_datetime(start)]
        if end:   df = df[df["time"] <= pd.to_datetime(end)]
        if len(df) > points:
            bins = np.linspace(0, len(df)-1, points+1, dtype=int)
            take = []
            for i in range(len(bins)-1):
                seg = df.iloc[bins[i]:bins[i+1]]
                if len(seg)==0: continue
                if   agg == "max": row = seg.loc[seg["value"].idxmax()]
                elif agg == "min": row = seg.loc[seg["value"].idxmin()]
                else:              row = seg.iloc[[0]].assign(value=seg["value"].mean()).iloc[0]
                take.append(row)
            df = pd.DataFrame(take)
        return {
            "x": df["time"].astype("datetime64[ms]").dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ").tolist(),
            "y": df["value"].astype(float).tolist(),
            "unit": ch.unit,
            "has_time": True
        }
    else:
        if start: df = df[df["time"] >= int(start)]
        if end:   df = df[df["time"] <= int(end)]
        if len(df) > points:
            bins = np.linspace(0, len(df)-1, points, dtype=int)
            df = df.iloc[bins]
        return {
            "x": df["time"].astype(int).tolist(),
            "y": df["value"].astype(float).tolist(),
            "unit": ch.unit,
            "has_time": False
        }
