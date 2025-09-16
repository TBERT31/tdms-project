"use client";
import { useEffect, useMemo, useState } from "react";
import PlotMulti, { Series } from "../components/PlotMulti";
import type { Dataset, Channel, WindowResp } from "../types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function fetchWindowSec(chId: number, a=0.5, b=1.0): Promise<WindowResp> {
  const r = await fetch(`${API}/window?channel_id=${chId}&relative=1&start_sec=${a}&end_sec=${b}&points=2000`, { cache:"no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default function PulsePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dsId, setDsId] = useState<number | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [series, setSeries] = useState<Series[]|null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ (async()=>{
    const r = await fetch(`${API}/datasets`, { cache:"no-store" });
    const j = await r.json(); setDatasets(j); if (j?.length) setDsId(j[0].id);
  })(); }, []);

  useEffect(()=>{ if (!dsId) return;
    (async()=>{
      const r = await fetch(`${API}/datasets/${dsId}/channels`, { cache:"no-store" });
      const j: Channel[] = await r.json(); setChannels(j);
    })();
  }, [dsId]);

  const title = useMemo(()=>{
    const d = datasets.find(d => d.id===dsId);
    return d ? `Pulse demo — ${d.filename}` : "Pulse demo";
  }, [datasets, dsId]);

  async function load() {
    if (!channels.length) return;
    setLoading(true);
    try {
      // cherche les 3 canaux par nom (insensible à la casse)
      const findBy = (k:string) => channels.find(c => c.channel_name.toLowerCase() === k);
      const pulse  = findBy("pulse");
      const sx     = findBy("sensor x");
      const sy     = findBy("sensor y");

      const picks = [pulse, sx, sy].filter(Boolean) as Channel[];
      // fallback si noms différents: on prend les 3 premiers
      const chosen = picks.length === 3 ? picks : channels.slice(0,3);

      const windows = await Promise.all(chosen.map(c => fetchWindowSec(c.id, 0.5, 1.0)));
      const s: Series[] = windows.map((w, i) => ({
        x: w.x as number[], y: w.y, name: chosen[i].channel_name
      }));
      setSeries(s);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ if (channels.length) load(); }, [channels]);

  return (
    <main style={{ maxWidth:1000, margin:"24px auto", padding:"0 16px" }}>
      <h1 style={{ fontSize:24, fontWeight:600, marginBottom:12 }}>Pulse / Sensors</h1>

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:12 }}>
        <label>
          Dataset:&nbsp;
          <select value={dsId ?? ""} onChange={e=>setDsId(Number(e.target.value))}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.id} — {d.filename}</option>)}
          </select>
        </label>
        <button onClick={load} disabled={loading || !channels.length}>
          {loading ? "Chargement…" : "Recharger (0.5–1.0 s)"}
        </button>
      </div>

      {!series && <div>Ingeste <code>pulse_ringing.tdms</code> puis recharge.</div>}
      {series && <PlotMulti series={series} title={title} />}
    </main>
  );
}
