"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import IntelligentPlotClient from "../components/IntelligentPlotClient";
import UploadBox from "../components/UploadBox";


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

interface FilteredWindowResp {
  x: number[];
  y: number[];
  unit?: string;
  has_time: boolean;
  original_points: number;
  sampled_points: number;
  has_more: boolean;
  next_cursor?: number;
  method: string;
}

interface TimeRange {
  channel_id: number;
  has_time: boolean;
  min_timestamp?: number;
  max_timestamp?: number;
  total_points: number;
}

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function IntelligentPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [globalData, setGlobalData] = useState<FilteredWindowResp | null>(null);
  const [loading, setLoading] = useState(false);

  // Paramètres pour la vue globale (moins de points pour performance)
  const [globalPoints] = useState(2000);
  // Paramètres pour le zoom (plus de points pour précision)
  const [zoomPoints] = useState(3000);

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

  async function loadTimeRange(selectedChannelId: number) {
    try {
      const response = await fetch(`${API}/channels/${selectedChannelId}/time_range`, { cache: "no-store" });
      if (response.ok) {
        const range = await response.json();
        setTimeRange(range);
      }
    } catch (error) {
      console.error("Erreur chargement time range:", error);
    }
  }

  async function loadGlobalView(selectedChannelId: number) {
    setLoading(true);
    try {
      // Chargement de la vue globale avec moins de points
      const params = new URLSearchParams({
        channel_id: selectedChannelId.toString(),
        points: globalPoints.toString(),
        method: "lttb",
        limit: "100000" // Limite raisonnable pour la vue globale
      });

      const response = await fetch(`${API}/get_window_filtered?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();

      setGlobalData(result);
      console.log(`Vue globale chargée: ${result.original_points} → ${result.sampled_points} points`);

    } catch (error) {
      console.error("Erreur chargement vue globale:", error);
    } finally {
      setLoading(false);
    }
  }

  // Fonction de rechargement intelligent pour le zoom
  const handleZoomReload = useCallback(async (range: { start: number; end: number }) => {
    if (!channelId || !timeRange) {
      throw new Error("Channel ou time range non disponible");
    }

    console.log(`Rechargement zoom: ${range.start} → ${range.end}`);

    const params = new URLSearchParams({
      channel_id: channelId.toString(),
      start_timestamp: range.start.toString(),
      end_timestamp: range.end.toString(),
      points: zoomPoints.toString(),
      method: "lttb",
      limit: "200000" // Limite plus élevée pour le zoom
    });

    const response = await fetch(`${API}/get_window_filtered?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();

    console.log(`Zoom rechargé: ${result.original_points} → ${result.sampled_points} points dans la zone`);

    return {
      x: result.x,
      y: result.y
    };
  }, [channelId, timeRange, zoomPoints]);

  useEffect(() => { 
    loadDatasets(); 
  }, []);

  useEffect(() => { 
    if (datasetId) loadChannels(datasetId); 
  }, [datasetId]);

  useEffect(() => { 
    if (channelId) {
      loadTimeRange(channelId);
      loadGlobalView(channelId);
    }
  }, [channelId]);

  const title = useMemo(() => {
    const channel = channels.find(channel => channel.id === channelId);
    return channel ? `${channel.group_name} / ${channel.channel_name}` : "Signal";
  }, [channels, channelId]);

  const plotData = useMemo(() => {
    if (!globalData) return null;
    
    return {
      x: globalData.x,
      y: globalData.y,
      title,
      unit: globalData.unit,
      has_time: globalData.has_time
    };
  }, [globalData, title]);

  return (
    <main style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        TDMS Viewer - Zoom Intelligent
      </h1>

      <div style={{ 
        padding: "12px", 
        backgroundColor: "#e8f5e8", 
        border: "1px solid #4caf50", 
        borderRadius: "4px", 
        marginBottom: 16,
        fontSize: 14 
      }}>
        <strong>Mode Intelligent:</strong> Vue globale ({globalPoints} pts) puis rechargement automatique 
        avec plus de détails ({zoomPoints} pts) lors du zoom. Idéal pour l'exploration de données.
      </div>

      <UploadBox onDone={loadDatasets} />

      {/* Sélection Dataset/Channel */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label>
          Dataset:&nbsp;
          <select 
            value={datasetId ?? ""} 
            onChange={(event) => setDatasetId(Number(event.target.value))}
            disabled={loading}
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
            disabled={loading}
          >
            {channels.map(channel => (
              <option key={channel.id} value={channel.id}>
                {channel.group_name} — {channel.channel_name} ({channel.n_rows.toLocaleString()})
              </option>
            ))}
          </select>
        </label>

        <button 
          onClick={() => channelId && loadGlobalView(channelId)} 
          disabled={!channelId || loading}
        >
          {loading ? "Chargement…" : "Recharger Vue Globale"}
        </button>
      </div>

      {/* Informations sur le dataset */}
      {timeRange && (
        <div style={{ 
          padding: "8px 12px", 
          backgroundColor: "#f5f5f5", 
          borderRadius: "4px", 
          marginBottom: 12,
          fontSize: 13,
          color: "#555"
        }}>
          <strong>Dataset:</strong> {timeRange.total_points.toLocaleString()} points total
          {timeRange.has_time && timeRange.min_timestamp && timeRange.max_timestamp && (
            <> • Durée: {((timeRange.max_timestamp - timeRange.min_timestamp) / 3600).toFixed(1)}h</>
          )}
        </div>
      )}

      {/* Statistiques temps réel */}
      {globalData && (
        <div style={{ 
          marginBottom: 12, 
          padding: "8px", 
          backgroundColor: "#f0f8ff", 
          borderRadius: "4px",
          fontSize: 12
        }}>
          <strong>Vue actuelle:</strong> {globalData.original_points.toLocaleString()} → {globalData.sampled_points.toLocaleString()} points 
          (algorithme {globalData.method})
        </div>
      )}

      {/* Graphique intelligent */}
      {!plotData && !loading && <div>Sélectionnez un canal pour commencer l'exploration…</div>}
      {loading && <div>Chargement de la vue globale…</div>}
      {plotData && channelId && (
        <IntelligentPlotClient
          key={channelId}    
          channelId={channelId}
          initialData={plotData}
          onZoomReload={handleZoomReload}
        />
      )}

      {/* Guide d'utilisation */}
      {plotData && (
        <div style={{ 
          marginTop: 16, 
          padding: "12px", 
          backgroundColor: "#fffbf0", 
          border: "1px solid #ffc107", 
          borderRadius: "4px",
          fontSize: 13
        }}>
          <strong>Comment utiliser :</strong>
          <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
            <li>🔍 <strong>Zoom :</strong> Cliquez-glissez sur le graphique pour zoomer</li>
            <li>🔄 <strong>Rechargement auto :</strong> Les données sont rechargées automatiquement avec plus de précision</li>
            <li>🏠 <strong>Reset :</strong> Double-clic pour revenir à la vue globale</li>
            <li>🔧 <strong>Reload :</strong> Utilisez le bouton de rechargement dans la barre d'outils</li>
          </ul>
        </div>
      )}
    </main>
  );
}