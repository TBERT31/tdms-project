from nptdms import TdmsWriter, ChannelObject
import numpy as np
import datetime as dt

N  = 10_000_000   # 10 M points
FS = 10_000       # 10 kHz

t = np.arange(N, dtype=np.float64) / FS
sig1 = np.sin(2*np.pi*50*t).astype(np.float32)
sig2 = (np.sin(2*np.pi*120*t) + 0.2*np.random.randn(N)).astype(np.float32)
sig3 = (np.sign(np.sin(2*np.pi*5*t)) * 0.5).astype(np.float32)

start = dt.datetime(2024, 1, 1, 0, 0, 0)  # n’importe quelle date

def props(unit="V"):
    return {
        # notre backend sait lire NI_UnitDescription ou unit_string
        "NI_UnitDescription": unit,
        "wf_start_time": start,
        "wf_increment": 1.0 / FS,
        "wf_samples": N,           # optionnel mais utile
    }

with TdmsWriter("big_sample.tdms") as w:
    ch1 = ChannelObject("GroupA", "Sine50Hz",        sig1, properties=props())
    ch2 = ChannelObject("GroupA", "Sine120HzNoise",  sig2, properties=props())
    ch3 = ChannelObject("GroupA", "Square5Hz",       sig3, properties=props())
    w.write_segment([ch1, ch2, ch3])

print("OK -> big_sample.tdms")