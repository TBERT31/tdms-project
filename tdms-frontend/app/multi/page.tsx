"use client";
import { useEffect, useMemo, useState } from "react";
import UploadBox from "../components/UploadBox";
import PlotMulti, { Series } from "../components/PlotMulti";
import type { Dataset, Channel, WindowResp } from "../types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function MultiPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dsId, setDsId] = useState<number | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [points, setPoints] = useState<number>(3000);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadDatasets() {
    const r = await fetch(`${API}/datasets`, { cache: "no-store" });
    const j = await r.json();
    setDatasets(j);
    if (!dsId && j?.length) setDsId(j[0].id);
  }
  async function loadChannels(datasetId: number) {
    const r = await fetch(`${API}/datasets/${datasetId}/channels`, { cache: "no-store" });
    const j: Channel[] = await r.json();
    setChannels(j);
    setSelected([]);
    setSeries([]);
  }
  useEffect(() => { loadDatasets(); }, []);
  useEffect(() => { if (dsId) loadChannels(dsId); }, [dsId]);

  useEffect(() => {
    if (!selected.length) { setSeries([]); return; }
    setLoading(true);
    Promise.all(
      selected.map(id =>
        fetch(`${API}/window?channel_id=${id}&points=${points}`, { cache: "no-store" })
          .then(r => r.json())
          .then((w: WindowResp) => ({
            x: w.x, y: w.y,
            name: channels.find(c => c.id === id)?.channel_name ?? `ch ${id}`
          }))
      )
    ).then(setSeries).finally(() => setLoading(false));
  }, [selected, points, channels]);

  const title = useMemo(() => {
    const ds = datasets.find(d => d.id === dsId);
    return ds ? `Dataset #${ds.id} — ${ds.filename}` : "Multi channels";
  }, [datasets, dsId]);

  return (
    <main style={{ maxWidth: 1000, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        TDMS Viewer — Multi
      </h1>

      <UploadBox onDone={loadDatasets} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label>Dataset:&nbsp;
          <select value={dsId ?? ""} onChange={e => setDsId(Number(e.target.value))}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.id} — {d.filename}</option>)}
          </select>
        </label>

        <label>Points:&nbsp;
          <input type="number" min={50} max={20000} step={50}
                 value={points} onChange={e => setPoints(Number(e.target.value))}
                 style={{ width: 90 }} />
        </label>

        <button onClick={() => setSelected(channels.map(c => c.id))} disabled={!channels.length}>
          Select all
        </button>
        <button onClick={() => setSelected([])} disabled={!selected.length}>
          Clear
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <div className="border rounded p-3">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Channels</div>
          <div style={{ maxHeight: 260, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {channels.map(ch => (
              <label key={ch.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selected.includes(ch.id)}
                  onChange={() =>
                    setSelected(prev => prev.includes(ch.id)
                      ? prev.filter(x => x !== ch.id)
                      : [...prev, ch.id])
                  }
                />
                <span>
                  <b>{ch.channel_name}</b>
                  <span style={{ color: "#666" }}> — {ch.group_name}</span>
                </span>
              </label>
            ))}
            {!channels.length && <div style={{ color: "#666" }}>Aucun canal</div>}
          </div>
        </div>

        <div className="border rounded p-2">
          {loading && <div style={{ marginBottom: 6 }}>Chargement…</div>}
          <PlotMulti series={series} title={title} />
        </div>
      </div>
    </main>
  );
}
