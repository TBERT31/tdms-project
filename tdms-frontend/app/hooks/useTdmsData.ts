import { useState, useEffect, useCallback } from "react";

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
  min_index?: number;
  max_index?: number;
  total_points: number;
}

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export function useTdmsData() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [globalData, setGlobalData] = useState<FilteredWindowResp | null>(null);
  const [loading, setLoading] = useState(false);

  // Chargement des datasets
  const loadDatasets = useCallback(async () => {
    try {
      const response = await fetch(`${API}/datasets`, { cache: "no-store" });
      const datasets = await response.json();
      setDatasets(datasets);
      if (!datasetId && datasets?.length) {
        setDatasetId(datasets[0].id);
      }
    } catch (error) {
      console.error("Erreur chargement datasets:", error);
    }
  }, [datasetId]);

  // Chargement des channels
  const loadChannels = useCallback(async (selectedDatasetId: number) => {
    try {
      const response = await fetch(`${API}/datasets/${selectedDatasetId}/channels`, { cache: "no-store" });
      const channels = await response.json();
      setChannels(channels);
      if (channels?.length) {
        setChannelId(channels[0].id);
      } else {
        setChannelId(null);
      }
    } catch (error) {
      console.error("Erreur chargement channels:", error);
    }
  }, []);

  // Chargement du time range
  const loadTimeRange = useCallback(async (selectedChannelId: number) => {
    try {
      const response = await fetch(`${API}/channels/${selectedChannelId}/time_range`, { cache: "no-store" });
      if (response.ok) {
        const range = await response.json();
        setTimeRange(range);
        console.log("Time range chargé:", range);
      }
    } catch (error) {
      console.error("Erreur chargement time range:", error);
    }
  }, []);

  // Chargement de la vue globale
  const loadGlobalView = useCallback(async (
    selectedChannelId: number, 
    globalPoints: number, 
    initialLimit: number
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        channel_id: selectedChannelId.toString(),
        points: globalPoints.toString(),
        method: "lttb",
        limit: initialLimit.toString()
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
  }, []);

  // Fonction de rechargement pour le zoom
  const createZoomReloadHandler = useCallback((zoomPoints: number) => {
    return async (range: { start: number; end: number }) => {
      if (!channelId || !timeRange) {
        throw new Error("Channel ou time range non disponible");
      }

      console.log(`Rechargement zoom: ${range.start.toFixed(2)} → ${range.end.toFixed(2)}`);

      const params = new URLSearchParams({
        channel_id: channelId.toString(),
        start_timestamp: range.start.toString(),
        end_timestamp: range.end.toString(),
        points: zoomPoints.toString(),
        method: "lttb",
        limit: "200000"
      });

      const response = await fetch(`${API}/get_window_filtered?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();

      console.log(`Zoom rechargé: ${result.original_points} → ${result.sampled_points} points dans la zone`);

      return {
        x: result.x,
        y: result.y
      };
    };
  }, [channelId, timeRange]);

  // Effects pour les chargements automatiques
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (datasetId) loadChannels(datasetId);
  }, [datasetId, loadChannels]);

  return {
    // States
    datasets,
    datasetId,
    setDatasetId,
    channels,
    channelId,
    setChannelId,
    timeRange,
    globalData,
    loading,
    
    // Actions
    loadDatasets,
    loadTimeRange,
    loadGlobalView,
    createZoomReloadHandler
  };
}