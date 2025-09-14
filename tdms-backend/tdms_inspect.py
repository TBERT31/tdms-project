from __future__ import annotations
from nptdms import TdmsFile
import pandas as pd, numpy as np
import argparse, sys

def mk_time_series(ch):
    """Retourne (time, values, has_time) avec fallback si pas de time_track."""
    vals = ch[:]
    has_time = False
    t = None
    # 1) piste de temps explicite
    try:
        t = ch.time_track()
        if t is not None:
            has_time = True
            t = pd.to_datetime(t)
    except Exception:
        t = None
    # 2) waveform (dt / t0)
    if (not has_time):
        dt = ch.properties.get("wf_increment")
        t0 = ch.properties.get("wf_start_time_stamp") or ch.properties.get("wf_start_offset")
        if isinstance(dt, (int, float)):
            base = 0.0
            try: base = float(t0) if t0 is not None else 0.0
            except Exception: pass
            t = base + np.arange(len(vals), dtype=float)*float(dt)
        else:
            # 3) index d’échantillon
            t = np.arange(len(vals), dtype=int)
    return t, vals, has_time

def preview_channel(ch, max_show=8):
    unit = ch.properties.get("NI_UnitDescription") or ch.properties.get("unit_string")
    dt   = ch.properties.get("wf_increment")
    t0   = ch.properties.get("wf_start_time_stamp") or ch.properties.get("wf_start_offset")
    t, v, has_time = mk_time_series(ch)
    print(f"    • canal: {ch.name}")
    print(f"      type={v.dtype}  n={len(v)}  unit={unit!r}  has_time={has_time}  wf_increment={dt!r}  t0={t0!r}")
    # aperçu
    n = min(max_show, len(v))
    vv = v[:n]
    tt = t[:n]
    print(f"      head(x,y):")
    for i in range(n):
        print(f"        {tt[i]}  ->  {vv[i]}")
    # stats si numérique
    try:
        arr = np.asarray(v, dtype=float)
        print(f"      stats: min={np.nanmin(arr)}  max={np.nanmax(arr)}  mean={np.nanmean(arr)}")
    except Exception:
        pass

def inspect(path: str):
    tdms = TdmsFile.read(path)
    print(f"=== FICHIER: {path}")
    if getattr(tdms, 'properties', None):
        print("= Propriétés fichier =", dict(tdms.properties))
    print("= GROUPES / CANAUX =")
    for g in tdms.groups():
        print(f"- Groupe: {g.name}")
        if getattr(g, 'properties', None):
            if g.properties:
                print(f"  props groupe: {dict(g.properties)}")
        for ch in g.channels():
            preview_channel(ch)

def export_csv(path: str, group: str, channel: str, out_csv: str):
    tdms = TdmsFile.read(path)
    ch = tdms[group][channel]
    t, v, has_time = mk_time_series(ch)
    df = pd.DataFrame({"time": t, "value": v})
    df.to_csv(out_csv, index=False)
    print(f"CSV écrit: {out_csv}  (rows={len(df)}, has_time={has_time})")

def main():
    p = argparse.ArgumentParser(description="Inspecteur TDMS (hiérarchie, métadonnées, aperçu, export CSV)")
    p.add_argument("file", help="Chemin du .tdms")
    p.add_argument("--export-csv", help="Chemin CSV de sortie (optionnel)")
    p.add_argument("--group", help="Nom du groupe (obligatoire si --export-csv)")
    p.add_argument("--channel", help="Nom du canal (obligatoire si --export-csv)")
    args = p.parse_args()

    if args.export_csv:
        if not (args.group and args.channel):
            print("⚠️  --group et --channel sont requis avec --export-csv", file=sys.stderr)
            sys.exit(2)
        export_csv(args.file, args.group, args.channel, args.export_csv)
    else:
        inspect(args.file)

if __name__ == "__main__":
    main()
