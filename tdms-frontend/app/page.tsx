"use client";
import { useEffect, useMemo, useState } from "react";
import PlotClient from "./components/PlotClient";
import UploadBox from "./components/UploadBox";
import type { Dataset, Channel, WindowResp } from "./types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function Page() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dsId, setDsId] = useState<number | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [chId, setChId] = useState<number | null>(null);

  const [win, setWin] = useState<WindowResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadDatasets() {
    const r = await fetch(`${API}/datasets`, { cache:"no-store" });
    const j = await r.json();
    setDatasets(j);
    if (!dsId && j?.length) setDsId(j[0].id);
  }

  async function loadChannels(datasetId: number) {
    const r = await fetch(`${API}/datasets/${datasetId}/channels`, { cache:"no-store" });
    const j = await r.json();
    setChannels(j);
    if (j?.length) setChId(j[0].id); else setChId(null);
  }

  async function loadWindow(channelId: number) {
    setLoading(true);
    try {
      const r = await fetch(`${API}/window?channel_id=${channelId}&points=2000`, { cache:"no-store" });
      if (!r.ok) throw new Error(await r.text());
      setWin(await r.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDatasets(); }, []);
  useEffect(() => { if (dsId) loadChannels(dsId); }, [dsId]);
  useEffect(() => { if (chId) loadWindow(chId); }, [chId]);

  const title = useMemo(() => {
    const ch = channels.find(c => c.id === chId);
    return ch ? `${ch.group_name} / ${ch.channel_name}` : "Signal";
  }, [channels, chId]);

  return (
    <main style={{ maxWidth:1000, margin:"24px auto", padding:"0 16px" }}>
      <h1 style={{ fontSize:24, fontWeight:600, marginBottom:12 }}>TDMS Viewer</h1>

      <UploadBox onDone={loadDatasets} />

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:12 }}>
        <label>
          Dataset:&nbsp;
          <select value={dsId ?? ""} onChange={(e)=>setDsId(Number(e.target.value))}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.id} — {d.filename}</option>)}
          </select>
        </label>

        <label>
          Channel:&nbsp;
          <select value={chId ?? ""} onChange={(e)=>setChId(Number(e.target.value))}>
            {channels.map(c =>
              <option key={c.id} value={c.id}>
                {c.group_name} — {c.channel_name} ({c.n_rows})
              </option>
            )}
          </select>
        </label>

        <button onClick={() => chId && loadWindow(chId)} disabled={!chId || loading}>
          {loading ? "Chargement…" : "Rafraîchir la fenêtre"}
        </button>
      </div>

      {!win && <div>Ingest un TDMS ou sélectionne un canal…</div>}
      {win && <PlotClient x={win.x} y={win.y} title={title} />}
    </main>
  );
}
