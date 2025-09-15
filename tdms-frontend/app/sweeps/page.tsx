"use client";
import { useEffect, useMemo, useState } from "react";
import PlotClient from "../components/PlotClient"; // on réutilise ton composant existant
import UploadBox from "../components/UploadBox";
import type { Dataset, Channel, WindowResp } from "../types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function SweepsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dsId, setDsId] = useState<number | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [chTopId, setChTopId] = useState<number | null>(null);
  const [chBottomId, setChBottomId] = useState<number | null>(null);

  const [winTop, setWinTop] = useState<WindowResp | null>(null);
  const [winBottom, setWinBottom] = useState<WindowResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadDatasets() {
    const r = await fetch(`${API}/datasets`, { cache: "no-store" });
    const j = await r.json();
    setDatasets(j);
    if (!dsId && j?.length) setDsId(j[0].id);
  }

  async function loadChannels(datasetId: number) {
    const r = await fetch(`${API}/datasets/${datasetId}/channels`, { cache: "no-store" });
    const j = await r.json();
    setChannels(j);
    // auto-sélection : prend les 2 premiers canaux s'il y en a au moins 2
    if (j?.length >= 2) {
      setChTopId(j[0].id);
      setChBottomId(j[1].id);
    } else {
      setChTopId(j[0]?.id ?? null);
      setChBottomId(null);
    }
  }

  async function loadWindow(channelId: number) {
    const r = await fetch(`${API}/window?channel_id=${channelId}&points=2000`, { cache: "no-store" });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()) as WindowResp;
  }

  async function refresh() {
    if (!chTopId && !chBottomId) return;
    setLoading(true);
    try {
      if (chTopId) setWinTop(await loadWindow(chTopId)); else setWinTop(null);
      if (chBottomId) setWinBottom(await loadWindow(chBottomId)); else setWinBottom(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDatasets(); }, []);
  useEffect(() => { if (dsId) loadChannels(dsId); }, [dsId]);
  useEffect(() => { refresh(); /* auto-refresh */ }, [chTopId, chBottomId]);

  const titleTop = useMemo(() => {
    const ch = channels.find(c => c.id === chTopId);
    return ch ? `${ch.group_name} / ${ch.channel_name}` : "Signal (haut)";
  }, [channels, chTopId]);

  const titleBottom = useMemo(() => {
    const ch = channels.find(c => c.id === chBottomId);
    return ch ? `${ch.group_name} / ${ch.channel_name}` : "Signal (bas)";
  }, [channels, chBottomId]);

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        TDMS Viewer — Sweeps (2 courbes empilées)
      </h1>

      <UploadBox onDone={loadDatasets} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
        <label>
          Dataset:&nbsp;
          <select value={dsId ?? ""} onChange={(e) => setDsId(Number(e.target.value))}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.id} — {d.filename}</option>)}
          </select>
        </label>

        <label>
          Canal (haut):&nbsp;
          <select value={chTopId ?? ""} onChange={(e)=>setChTopId(Number(e.target.value))}>
            {channels.map(c =>
              <option key={c.id} value={c.id}>{c.group_name} — {c.channel_name} ({c.n_rows})</option>
            )}
          </select>
        </label>

        <label>
          Canal (bas):&nbsp;
          <select value={chBottomId ?? ""} onChange={(e)=>setChBottomId(Number(e.target.value))}>
            <option value="">—</option>
            {channels.map(c =>
              <option key={c.id} value={c.id}>{c.group_name} — {c.channel_name} ({c.n_rows})</option>
            )}
          </select>
        </label>

        <button onClick={refresh} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {!winTop && !winBottom && <div>Ingest un TDMS puis choisis 2 canaux…</div>}

      {winTop && (
        <div style={{ marginBottom: 24 }}>
          <PlotClient x={winTop.x} y={winTop.y} title={titleTop} />
        </div>
      )}

      {winBottom && (
        <div>
          <PlotClient x={winBottom.x} y={winBottom.y} title={titleBottom} />
        </div>
      )}
    </main>
  );
}
