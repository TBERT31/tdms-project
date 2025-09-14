from nptdms import TdmsFile
import pandas as pd
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
import re

# Remplace les caractères interdits Windows et nettoie la fin
def safe_filename(name: str) -> str:
    # Interdits: < > : " / \ | ? *  + contrôles 0x00-0x1F
    name = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", name)
    # Windows n'accepte pas "." ou " " final
    name = name.rstrip(" .")
    # Longueurs de chemin: on coupe large pour éviter 260+ chars
    return name[:200]

def tdms_to_parquet(tdms_path: str, out_dir: str):
    tdms = TdmsFile.read(tdms_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    meta = []
    for group in tdms.groups():
        for ch in group.channels():
            # 1) valeurs
            values = ch[:]
            df = pd.DataFrame({"value": values})

            # 2) temps si dispo
            has_time = False
            try:
                t = ch.time_track()
                if t is not None:
                    df.insert(0, "time", pd.to_datetime(t))
                    has_time = True
            except Exception:
                # fallback: index échantillon
                df.insert(0, "time", np.arange(len(df)))

            # 3) unité si dispo
            unit = ch.properties.get("NI_UnitDescription") or ch.properties.get("unit_string")

            # 4) nom de fichier PARFAITEMENT SAFE pour Windows
            g = safe_filename(group.name)
            c = safe_filename(ch.name)
            pq_path = out / f"{g}__{c}.parquet"

            # (debug utile) affiche le chemin avant écriture
            print(f"[TDMS→Parquet] Écriture: {pq_path}")

            # 5) écriture Parquet (ZSTD)
            table = pa.Table.from_pandas(df, preserve_index=False)
            pq.write_table(table, str(pq_path), compression="zstd")

            meta.append({
                "group": group.name,
                "channel": ch.name,
                "rows": len(df),
                "parquet": str(pq_path),
                "has_time": has_time,
                "unit": unit,
            })
    return meta
