from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class Dataset(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Channel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="dataset.id")
    group_name: str
    channel_name: str
    n_rows: int
    parquet_path: str
    has_time: bool
    unit: Optional[str] = None
