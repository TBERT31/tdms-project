import numpy as np
from nptdms import TdmsWriter, GroupObject, ChannelObject
import datetime as dt

# --- paramètres temps : 60 jours, pas d'1h
days = 60
fs_hz = 1/3600.0               # 1 point par heure  => incrément = 3600 s
n = days * 24
t = np.arange(n)

start = dt.datetime(2008, 1, 1, 0, 0, 0)  # date de départ

rng = np.random.default_rng(42)

# --- signaux synthétiques
base_daily = np.sin(2*np.pi * t/24)                 # cycle jour/nuit
season     = np.sin(2*np.pi * t/(24*30))            # ~mensuel

T_min = 5 + 3*season + 0.5*base_daily + 0.2*rng.standard_normal(n)
T_max = T_min + 8 + 0.5*base_daily + 0.3*rng.standard_normal(n)

# précipitations : mostly zeros + impulsions positives
rain_hits = rng.random(n) < 0.10                     # 10% des heures
Precipitation = np.where(rain_hits, rng.gamma(2.0, 3.0, n), 0.0)  # mm/h

# moyennes glissantes (7 jours)
def moving_mean(x, win):
    k = win
    w = np.ones(k)/k
    return np.convolve(x, w, mode="same")

AverageMinimumTemp  = moving_mean(T_min, 24*7)
AverageMaximumTemp  = moving_mean(T_max, 24*7)

# moyenne 6h (comme "T_6h" dans certaines démos)
T_6h = moving_mean((T_min + T_max)/2, 6)

# index quelconque (ex : bruit gaussien accumulé, clampé)
Index = np.cumsum(0.01*rng.standard_normal(n))
Index = np.clip(Index, -2, 2)

with TdmsWriter("weather_60d.tdms") as w:
    g = GroupObject("Weather")

    def ch(name, data, unit=None):
        props = {
            "wf_start_time": start,   # datetime de départ
            "wf_increment":  3600.0,  # secondes entre échantillons (1 h)
            "wf_samples":    int(n),  # nombre d'échantillons
        }
        if unit:
            props["NI_UnitDescription"] = unit

        return ChannelObject(
            "Weather",
            name,
            np.asarray(data, dtype=float),
            properties=props,
        )


    c_Tmin  = ch("T_min",  T_min,  "°C")
    c_Tmax  = ch("T_max",  T_max,  "°C")
    c_rain  = ch("Precipitation", Precipitation, "mm/h")
    c_T6h   = ch("T_6h",   T_6h,   "°C")
    c_Idx   = ch("Index",  Index)
    c_avgmn = ch("AverageMinimumTemp", AverageMinimumTemp, "°C")
    c_avgmx = ch("AverageMaximumTemp", AverageMaximumTemp, "°C")

    w.write_segment([g, c_Tmin, c_Tmax, c_rain, c_T6h, c_Idx, c_avgmn, c_avgmx])

print("OK -> weather_60d.tdms")
