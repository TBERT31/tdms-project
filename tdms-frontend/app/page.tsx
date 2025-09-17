"use client";
import { useEffect, useMemo, useState } from "react";
import PlotClient from "./components/PlotClient";
import UploadBox from "./components/UploadBox";

// Types mis à jour
interface Dataset {
  id: number;
  filename: string;
  created_at: string;
}

interface Channel {
  id: number;
  dataset_id: number;
  group_name: string;
  channel_name: string;
  n_rows: number;
  parquet_path: string;
  has_time: boolean;
  unit?: string;
}

interface WindowResp {
  x: (string | number)[];
  y: number[];
  unit?: string;
  has_time: boolean;
  x_unit?: string;
  original_points?: number;
  returned_points?: number;
  method?: string;
}

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function Page() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<number | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<number | null>(null);

  const [downsampleMethod, setDownsampleMethod] = useState<"lttb" | "uniform">("lttb");
  const [pointsTarget, setPointsTarget] = useState(2000);

  const [windowData, setWindowData] = useState<WindowResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadDatasets() {
    const response = await fetch(`${API}/datasets`, { cache: "no-store" });
    const datasets = await response.json();
    setDatasets(datasets);
    if (!datasetId && datasets?.length) {
      setDatasetId(datasets[0].id);
    }
  }

  async function loadChannels(selectedDatasetId: number) {
    const response = await fetch(`${API}/datasets/${selectedDatasetId}/channels`, { cache: "no-store" });
    const channels = await response.json();
    setChannels(channels);
    if (channels?.length) {
      setChannelId(channels[0].id);
    } else {
      setChannelId(null);
    }
  }

  async function loadWindow(selectedChannelId: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        channel_id: selectedChannelId.toString(),
        points: pointsTarget.toString(),
        method: downsampleMethod,
        relative: "true"
      });
      
      const response = await fetch(`${API}/window?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      
      console.log(`Downsampling: ${result.original_points} → ${result.returned_points} points (${result.method})`);
      setWindowData(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    loadDatasets(); 
  }, []);

  useEffect(() => { 
    if (datasetId) loadChannels(datasetId); 
  }, [datasetId]);

  useEffect(() => { 
    if (channelId) loadWindow(channelId); 
  }, [channelId, pointsTarget, downsampleMethod]);

  const title = useMemo(() => {
    const channel = channels.find(channel => channel.id === channelId);
    return channel ? `${channel.group_name} / ${channel.channel_name}` : "Signal";
  }, [channels, channelId]);

  return (
    <main style={{ maxWidth: 1000, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>TDMS Viewer</h1>

      <UploadBox onDone={loadDatasets} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label>
          Dataset:&nbsp;
          <select 
            value={datasetId ?? ""} 
            onChange={(event) => setDatasetId(Number(event.target.value))}
          >
            {datasets.map(dataset => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.id} — {dataset.filename}
              </option>
            ))}
          </select>
        </label>

        <label>
          Channel:&nbsp;
          <select 
            value={channelId ?? ""} 
            onChange={(event) => setChannelId(Number(event.target.value))}
          >
            {channels.map(channel => (
              <option key={channel.id} value={channel.id}>
                {channel.group_name} — {channel.channel_name} ({channel.n_rows})
              </option>
            ))}
          </select>
        </label>

        <label>
          Méthode:&nbsp;
          <select 
            value={downsampleMethod} 
            onChange={(event) => setDownsampleMethod(event.target.value as "lttb" | "uniform")}
          >
            <option value="lttb">LTTB (préserve la forme)</option>
            <option value="uniform">Uniforme (ancienne méthode rapide)</option>
          </select>
        </label>

        <label>
          Points max:&nbsp;
          <input 
            type="number" 
            value={pointsTarget} 
            onChange={(event) => setPointsTarget(Number(event.target.value))}
            min="100" 
            max="20000"
            step="100"
          />
        </label>

        <button 
          onClick={() => channelId && loadWindow(channelId)} 
          disabled={!channelId || loading}
        >
          {loading ? "Chargement…" : "Rafraîchir la fenêtre"}
        </button>
      </div>

      {windowData && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: "12px", color: "#666" }}>
            {windowData.original_points?.toLocaleString()} → {windowData.returned_points?.toLocaleString()} points ({windowData.method})
          </span>
        </div>
      )}

      {!windowData && <div>Ingest un TDMS ou sélectionne un canal…</div>}
      {windowData && <PlotClient x={windowData.x} y={windowData.y} title={title} />}
    </main>
  );
}