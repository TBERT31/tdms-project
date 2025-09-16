import numpy as np
from nptdms import TdmsWriter, GroupObject, ChannelObject
import datetime as dt

def make_ch(group: str, name: str, y: np.ndarray, unit: str,
            start: dt.datetime, inc: float) -> ChannelObject:
    # Donner les propriétés directement au constructeur (compat. nptdms 1.10)
    props = {
        "NI_UnitDescription": unit,
        "wf_start_time": start,   # horodatage de départ
        "wf_increment": inc,      # pas temporel (s)
        "wf_samples": len(y),     # nb d'échantillons
    }
    return ChannelObject(group, name, y.astype(float), properties=props)

# ---------- Scénario A (figure 1) ----------
fs1 = 1000
inc1 = 1/fs1
t1 = np.arange(0, 0.060, inc1)
start1 = dt.datetime(2022, 4, 19, 14, 18, 32, 310000)

rpm1 = 3400 - 3500*(t1/0.060)
rpm1[t1 >= 0.035] = 600.0

cur1 = np.empty_like(t1)
mask_rise = t1 < 0.033
cur1[mask_rise] = np.interp(t1[mask_rise], [0, 0.033], [5.5, 9.5])
mask_fall = ~mask_rise
cur1[mask_fall] = np.maximum(0.0, 0.5 - 25*(t1[mask_fall]-0.033))

# ---------- Scénario B (figure 2) ----------
fs2 = 2000
inc2 = 1/fs2
t2 = np.arange(0, 0.120, inc2)
start2 = dt.datetime(2022, 4, 19, 14, 18, 32, 300000)

rpm2 = np.full_like(t2, 3400.0)
rpm2[(t2 >= 0.040) & (t2 < 0.060)] = 700.0
rpm2[(t2 >= 0.100)] = 700.0

cur2 = np.zeros_like(t2)
mask_h1 = (t2 >= 0.000) & (t2 < 0.040)
cur2[mask_h1] = np.interp(t2[mask_h1], [0.000, 0.040], [6.0, 9.5])
mask_h2 = (t2 >= 0.060) & (t2 < 0.100)
cur2[mask_h2] = np.interp(t2[mask_h2], [0.060, 0.100], [6.0, 9.5])
cur2[(t2 >= 0.040) & (t2 < 0.060)] = 0.0
cur2[(t2 >= 0.100)] = 0.0

# ---------- Écriture TDMS ----------
with TdmsWriter("motor_timetable.tdms") as w:
    g1 = GroupObject("Scenario A")
    w.write_segment([
        g1,
        make_ch("Scenario A", "Revolutions (1/min)", rpm1, "1/min", start1, inc1),
        make_ch("Scenario A", "Current (A)",          cur1, "A",     start1, inc1),
    ])

    g2 = GroupObject("Scenario B")
    w.write_segment([
        g2,
        make_ch("Scenario B", "Revolutions (1/min)", rpm2, "1/min", start2, inc2),
        make_ch("Scenario B", "Current (A)",          cur2, "A",     start2, inc2),
    ])

print("OK -> motor_timetable.tdms")
