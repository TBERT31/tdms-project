"use client";
import { useEffect, useMemo, useState } from "react";
import PlotMulti, { Series } from "../components/PlotMulti";
import type { Dataset, Channel, WindowResp } from "../types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function MultiPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dsId, setDsId] = useState<number | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [checked, setChecked] = useState<number[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`${API}/datasets`, { cache: "no-store" });
      const j: Dataset[] = await r.json();
      setDatasets(j);
      if (!dsId && j?.length) setDsId(j[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!dsId) return;
    (async () => {
      const r = await fetch(`${API}/datasets/${dsId}/channels`, { cache: "no-store" });
      const j: Channel[] = await r.json();
      setChannels(j);
      // pré-sélectionne quelques courbes météo si présentes
      const defaults = j
        .filter(c => c.group_name === "Weather" && ["T_min","T_max","Precipitation"].includes(c.channel_name))
        .map(c => c.id);
      setChecked(defaults.length ? defaults : []);
    })();
  }, [dsId]);

  async function fetchWindow(channelId: number): Promise<Series> {
    const r = await fetch(`${API}/window?channel_id=${channelId}&points=2000`, { cache: "no-store" });
    const w: WindowResp = await r.json();
    const ch = channels.find(c => c.id === channelId)!;
    return { x: w.x, y: w.y, name: `${ch.channel_name}` };
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await Promise.all(checked.map(fetchWindow));
      setSeries(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (checked.length) refresh(); }, [checked]);

  const title = useMemo(() => {
    const ds = datasets.find(d => d.id === dsId);
    return ds ? `Dataset #${ds.id} — ${ds.filename}` : "Multi-traces";
  }, [datasets, dsId]);

  return (
    <main style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Multi-traces</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Dataset:&nbsp;
          <select value={dsId ?? ""} onChange={(e) => setDsId(Number(e.target.value))}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.id} — {d.filename}</option>)}
          </select>
        </label>
        <button onClick={refresh} disabled={!checked.length || loading}>
          {loading ? "Chargement…" : "Tracer la sélection"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 8, marginTop: 12 }}>
        {channels.map(c => (
          <label key={c.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8 }}>
            <input
              type="checkbox"
              checked={checked.includes(c.id)}
              onChange={(e) => {
                setChecked(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
              }}
            />
            &nbsp;<strong>{c.group_name}</strong> — {c.channel_name} <em>({c.n_rows})</em>
          </label>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {series.length === 0 ? (
          <div>Sélectionne des canaux puis clique sur “Tracer la sélection”.</div>
        ) : (
          <PlotMulti series={series} title={title} />
        )}
      </div>
    </main>
  );
}
