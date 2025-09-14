from nptdms import TdmsWriter, ChannelObject
import numpy as np

out_path = "week_signals.tdms"

# 30 s à 100 Hz
fs = 100
dur = 30
n = fs * dur
t = np.arange(n) / fs

days = ["Sun", "Mon", "Tues", "Wed", "Thu", "Fri", "Sat"]

channels = []
for i, day in enumerate(days):
    # une base qui monte doucement + un sinus léger, décalé par jour
    y = (0.12 + 0.01*i) + 0.00004 * (np.arange(n)) + 0.02*np.sin(2*np.pi*(0.02 + 0.003*i)*t)
    channels.append(
        ChannelObject(
            "Simulated Week",       # group
            day,                    # channel name
            y.astype(np.float32),
            properties={
                "unit_string": "",      # tu peux mettre "%"
                "wf_increment": 1.0/fs, # (optionnel) incrément temporel
                "wf_samples": n,        # (optionnel) nb d'échantillons
            }
        )
    )

with TdmsWriter(out_path) as w:
    w.write_segment(channels)

print(f"OK: {out_path}")
