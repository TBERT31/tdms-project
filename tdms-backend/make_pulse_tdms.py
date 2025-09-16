# tdms-backend/make_pulse_tdms.py
import numpy as np
from nptdms import TdmsWriter, GroupObject, ChannelObject
import datetime as dt

fs  = 5000          # 5 kHz
dur = 1.0           # 1 s
t = np.arange(0, dur, 1/fs)
t0 = 0.64           # l'impulsion à 0.64 s

# ----- Signaux -----
pulse = np.zeros_like(t)
i0 = int(t0*fs)
pulse[max(i0-1,0)] = -0.15
pulse[i0]          =  3.30
pulse[min(i0+1, len(t)-1)] = -0.15

rng = np.random.default_rng(42)
noiseX = rng.normal(0, 0.005, size=t.size)
noiseY = rng.normal(0, 0.010, size=t.size)

A1, f1, tau1 = 0.08, 120.0, 0.030
A2, f2, tau2 = 0.22, 160.0, 0.040
mask = t >= t0
ring1 = np.zeros_like(t)
ring2 = np.zeros_like(t)
ring1[mask] = A1*np.exp(-(t[mask]-t0)/tau1)*np.sin(2*np.pi*f1*(t[mask]-t0))
ring2[mask] = A2*np.exp(-(t[mask]-t0)/tau2)*np.sin(2*np.pi*f2*(t[mask]-t0))

sensorX = 0.10 + noiseX + ring1
sensorY = 0.55 + noiseY + ring2

# ----- Propriétés temporelles (pour nptdms) -----
start = dt.datetime(1904, 1, 1, 0, 0, 0)      # même “style” que l’exemple MATLAB
def wf_props():
    return {"wf_start_time": start, "wf_increment": 1/fs, "wf_samples": t.size}

with TdmsWriter("pulse_ringing.tdms") as w:
    g  = GroupObject("DAQ")
    c0 = ChannelObject("DAQ", "Pulse",    pulse.astype("float64"),
                       properties={"NI_UnitDescription":"V", **wf_props()})
    c1 = ChannelObject("DAQ", "Sensor X", sensorX.astype("float64"),
                       properties={"NI_UnitDescription":"V", **wf_props()})
    c2 = ChannelObject("DAQ", "Sensor Y", sensorY.astype("float64"),
                       properties={"NI_UnitDescription":"V", **wf_props()})
    w.write_segment([g, c0, c1, c2])

print("OK -> pulse_ringing.tdms")
