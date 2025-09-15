import numpy as np
from nptdms import TdmsWriter, GroupObject, ChannelObject
import datetime as dt

fs = 1000          # 1 kHz
dur = 4.0          # 4 s
t = np.arange(0, dur, 1/fs)

# Amplitude sweep : amplitude qui monte progressivement, fréquence ~8 Hz
amp = np.clip((t - 0.5) * 2, 0, 1) * 6.0
amplitude_sweep = (amp * np.sin(2*np.pi*8*t)).astype(np.float64)

# Phase (frequency) sweep : fréquence qui accélère (chirp léger)
phase_sweep = np.sin(2*np.pi*(10*t + 6*t**2)).astype(np.float64)

start = dt.datetime(1904, 1, 1, 5, 21, 10)  # même style que l’exemple Matlab

with TdmsWriter("sweeps.tdms") as w:
    g = GroupObject("Sweeps")

    c1_props = {
        "NI_UnitDescription": "V",
        "wf_start_time": start,
        "wf_increment": 1/fs,
        "wf_samples": len(t),
    }
    c1 = ChannelObject("Sweeps", "Amplitude sweep", amplitude_sweep, properties=c1_props)

    c2_props = {
        "wf_start_time": start,
        "wf_increment": 1/fs,
        "wf_samples": len(t),
    }
    c2 = ChannelObject("Sweeps", "Phase sweep", phase_sweep, properties=c2_props)

    w.write_segment([g, c1, c2])

print("OK -> sweeps.tdms")
