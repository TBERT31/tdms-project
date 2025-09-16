import numpy as np
from nptdms import TdmsWriter, GroupObject, ChannelObject
import datetime as dt

# --------- signaux style "Scenario B" (paliers RPM + courant) ----------
fs = 2000.0
inc = 1.0/fs
t = np.arange(0, 0.120, inc)
start = dt.datetime(2022, 4, 19, 14, 18, 32, 300000)

rpm = np.full_like(t, 3400.0)
rpm[(t >= 0.040) & (t < 0.060)] = 700.0
rpm[(t >= 0.100)] = 700.0

cur = np.zeros_like(t)
mask1 = (t >= 0.000) & (t < 0.040)
cur[mask1] = np.interp(t[mask1], [0.000, 0.040], [6.0, 9.5])
mask2 = (t >= 0.060) & (t < 0.100)
cur[mask2] = np.interp(t[mask2], [0.060, 0.100], [6.0, 9.5])
cur[(t >= 0.040) & (t < 0.060)] = 0.0
cur[(t >= 0.100)] = 0.0

def ch(group, name, y, unit, extra_props: dict) -> ChannelObject:
    props = {
        "NI_UnitDescription": unit,
        "wf_start_time": start,
        "wf_increment": inc,
        "wf_samples": int(len(y)),
        **extra_props,
    }
    return ChannelObject(group, name, y.astype(float), properties=props)

file_props = {
    "Title": "Motor bench – step test",
    "Author": "Lab QA",
    "Project": "TDMS Demo",
    "CreatedAt": dt.datetime.utcnow(),
    "Notes": "Metadata example with file/group/channel properties",
}

group_props = {
    "Rig": "Bench A",
    "Operator": "Alice",
    "Location": "Test Cell 3",
}

with TdmsWriter("motor_meta.tdms") as w:
    g = GroupObject("Motor Test", properties=group_props)

    c_rpm = ch("Motor Test", "Revolutions (1/min)", rpm, "1/min", {
        "Sensor": "Encoder E-42",
        "CalibrationDate": dt.datetime(2022, 2, 10),
    })
    c_cur = ch("Motor Test", "Current (A)", cur, "A", {
        "Sensor": "Clamp C-17",
        "ScaleFactor": 0.1,
    })

    # propriétés fichier via write_segment(..., properties=...)
    try:
        w.write_segment([g, c_rpm, c_cur], file_properties=file_props)
    except TypeError:
        # fallback pour anciennes versions
        if hasattr(w, "write_file_properties"):
            w.write_file_properties(file_props)
        w.write_segment([g, c_rpm, c_cur])

print("OK -> motor_meta.tdms")
