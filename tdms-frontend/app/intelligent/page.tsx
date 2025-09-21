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
  min_index?: number;
  max_index?: number;
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

  // Paramètres configurables avec valeurs par défaut des variables d'environnement
  const [globalPoints, setGlobalPoints] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_GLOBAL_POINTS) || 2000
  );
  const [zoomPoints, setZoomPoints] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM_POINTS) || 3000
  );
  const [initialLimit, setInitialLimit] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_INITIAL_LIMIT) || 100000
  );
  
  // État pour l'affichage des paramètres avancés
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Contraintes backend (chargées dynamiquement depuis l'API)
  const [backendConstraints, setBackendConstraints] = useState({
    points: { min: 10, max: 20000 },
    limit: { min: 10000, max: 200000 }
  });

  // Chargement des contraintes backend au démarrage
  useEffect(() => {
    const loadConstraints = async () => {
      try {
        const response = await fetch(`${API}/api/constraints`);
        if (response.ok) {
          const constraints = await response.json();
          setBackendConstraints(constraints);
          console.log("Contraintes backend chargées:", constraints);
        }
      } catch (error) {
        console.warn("Impossible de charger les contraintes backend, utilisation des valeurs par défaut:", error);
      }
    };
    loadConstraints();
  }, []);

  // Validation des paramètres
  const validateParam = (value: number, type: 'points' | 'limit') => {
    const constraints = backendConstraints[type];
    return {
      isValid: value >= constraints.min && value <= constraints.max,
      min: constraints.min,
      max: constraints.max
    };
  };

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
        console.log("Time range chargé:", range);
      }
    } catch (error) {
      console.error("Erreur chargement time range:", error);
    }
  }

  async function loadGlobalView(selectedChannelId: number) {
    setLoading(true);
    try {
      // Chargement de la vue globale avec paramètres configurables
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
  }

  // Fonction de rechargement intelligent pour le zoom
  const handleZoomReload = useCallback(async (range: { start: number; end: number }) => {
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
  }, [channelId, globalPoints, initialLimit]); // Recharger quand les paramètres changent

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

  // Fonction pour réinitialiser les paramètres par défaut
  const resetToDefaults = () => {
    setGlobalPoints(Number(process.env.NEXT_PUBLIC_DEFAULT_GLOBAL_POINTS) || 2000);
    setZoomPoints(Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM_POINTS) || 3000);
    setInitialLimit(Number(process.env.NEXT_PUBLIC_DEFAULT_INITIAL_LIMIT) || 100000);
  };

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
        <strong>Mode Intelligent:</strong> Vue globale ({globalPoints.toLocaleString()} pts) puis rechargement automatique 
        avec plus de détails ({zoomPoints.toLocaleString()} pts) lors du zoom. Limite initiale: {initialLimit.toLocaleString()} pts.
      </div>

      <UploadBox onDone={loadDatasets} />

      {/* Paramètres avancés */}
      <div style={{ 
        marginBottom: 16, 
        padding: "12px", 
        backgroundColor: "#f8f9fa", 
        border: "1px solid #dee2e6", 
        borderRadius: "4px" 
      }}>
        <button 
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          style={{
            backgroundColor: "transparent",
            border: "none",
            color: "#007bff",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500
          }}
        >
          {showAdvancedSettings ? "▼" : "▶"} Paramètres avancés
        </button>

        {showAdvancedSettings && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>
                Points vue globale:
              </span>
              <input
                type="number"
                value={globalPoints}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setGlobalPoints(value);
                }}
                min={backendConstraints.points.min}
                max={backendConstraints.points.max}
                style={{ 
                  padding: "6px 8px", 
                  border: validateParam(globalPoints, 'points').isValid ? "1px solid #ddd" : "2px solid #dc3545", 
                  borderRadius: "3px",
                  fontSize: 13,
                  backgroundColor: validateParam(globalPoints, 'points').isValid ? "white" : "#fff5f5"
                }}
              />
              {!validateParam(globalPoints, 'points').isValid && (
                <span style={{ fontSize: 11, color: "#dc3545", fontWeight: 500 }}>
                  ⚠️ Doit être entre {backendConstraints.points.min} et {backendConstraints.points.max.toLocaleString()}
                </span>
              )}
              <span style={{ fontSize: 11, color: "#666" }}>
                Recommandé: 1000-5000
              </span>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>
                Points zoom détaillé:
              </span>
              <input
                type="number"
                value={zoomPoints}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setZoomPoints(value);
                }}
                min={backendConstraints.points.min}
                max={backendConstraints.points.max}
                style={{ 
                  padding: "6px 8px", 
                  border: validateParam(zoomPoints, 'points').isValid ? "1px solid #ddd" : "2px solid #dc3545", 
                  borderRadius: "3px",
                  fontSize: 13,
                  backgroundColor: validateParam(zoomPoints, 'points').isValid ? "white" : "#fff5f5"
                }}
              />
              {!validateParam(zoomPoints, 'points').isValid && (
                <span style={{ fontSize: 11, color: "#dc3545", fontWeight: 500 }}>
                  ⚠️ Doit être entre {backendConstraints.points.min} et {backendConstraints.points.max.toLocaleString()}
                </span>
              )}
              <span style={{ fontSize: 11, color: "#666" }}>
                Recommandé: 2000-10000
              </span>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>
                Limite initiale lecture:
              </span>
              <input
                type="number"
                value={initialLimit}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setInitialLimit(value);
                }}
                min={backendConstraints.limit.min}
                max={backendConstraints.limit.max}
                step={10000}
                style={{ 
                  padding: "6px 8px", 
                  border: validateParam(initialLimit, 'limit').isValid ? "1px solid #ddd" : "2px solid #dc3545", 
                  borderRadius: "3px",
                  fontSize: 13,
                  backgroundColor: validateParam(initialLimit, 'limit').isValid ? "white" : "#fff5f5"
                }}
              />
              {!validateParam(initialLimit, 'limit').isValid && (
                <span style={{ fontSize: 11, color: "#dc3545", fontWeight: 500 }}>
                  ⚠️ Doit être entre {backendConstraints.limit.min.toLocaleString()} et {backendConstraints.limit.max.toLocaleString()}
                </span>
              )}
              <span style={{ fontSize: 11, color: "#666" }}>
                Max {backendConstraints.limit.max.toLocaleString()} (limite backend actuelle)
              </span>
            </label>

            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }}>
              <button
                onClick={resetToDefaults}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "3px",
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                Réinitialiser
              </button>

              {/* Indicateur de validation global */}
              <div style={{
                padding: "6px 8px",
                borderRadius: "3px",
                fontSize: 11,
                textAlign: "center",
                fontWeight: 500,
                backgroundColor: (
                  validateParam(globalPoints, 'points').isValid && 
                  validateParam(zoomPoints, 'points').isValid && 
                  validateParam(initialLimit, 'limit').isValid
                ) ? "#d4edda" : "#f8d7da",
                color: (
                  validateParam(globalPoints, 'points').isValid && 
                  validateParam(zoomPoints, 'points').isValid && 
                  validateParam(initialLimit, 'limit').isValid
                ) ? "#155724" : "#721c24",
                border: (
                  validateParam(globalPoints, 'points').isValid && 
                  validateParam(zoomPoints, 'points').isValid && 
                  validateParam(initialLimit, 'limit').isValid
                ) ? "1px solid #c3e6cb" : "1px solid #f5c6cb"
              }}>
                {(
                  validateParam(globalPoints, 'points').isValid && 
                  validateParam(zoomPoints, 'points').isValid && 
                  validateParam(initialLimit, 'limit').isValid
                ) ? "✓ Paramètres valides" : "⚠️ Erreurs détectées"}
              </div>
            </div>
          </div>
        )}
      </div>

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
          disabled={
            !channelId || 
            loading || 
            !validateParam(globalPoints, 'points').isValid || 
            !validateParam(initialLimit, 'limit').isValid
          }
          style={{
            opacity: (
              !channelId || 
              loading || 
              !validateParam(globalPoints, 'points').isValid || 
              !validateParam(initialLimit, 'limit').isValid
            ) ? 0.6 : 1
          }}
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
            <>
              {" • "}
              <strong>Bornes:</strong> {timeRange.min_timestamp.toFixed(1)}s → {timeRange.max_timestamp.toFixed(1)}s
              {" • "}
              <strong>Durée:</strong> {((timeRange.max_timestamp - timeRange.min_timestamp) / 3600).toFixed(1)}h
            </>
          )}
          {!timeRange.has_time && timeRange.min_index !== undefined && timeRange.max_index !== undefined && (
            <>
              {" • "}
              <strong>Index:</strong> {timeRange.min_index} → {timeRange.max_index}
            </>
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
          {globalData.original_points > initialLimit && (
            <span style={{ color: "#ff6b35", marginLeft: 8 }}>
              ⚠️ Limité à {initialLimit.toLocaleString()} pts (ajustez la limite initiale si nécessaire)
            </span>
          )}
        </div>
      )}

      {/* Graphique intelligent */}
      {!plotData && !loading && <div>Sélectionnez un canal pour commencer l'exploration…</div>}
      {loading && <div>Chargement de la vue globale…</div>}
      {plotData && channelId && timeRange && (
        <IntelligentPlotClient
          key={`${channelId}-${globalPoints}-${zoomPoints}`}    
          channelId={channelId}
          initialData={plotData}
          timeRange={timeRange}
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
            <li>🔧 <strong>Paramètres :</strong> Ajustez les paramètres avancés pour optimiser selon vos fichiers</li>
            <li>🔍 <strong>Zoom :</strong> Cliquez-glissez sur le graphique pour zoomer</li>
            <li>🔄 <strong>Rechargement auto :</strong> Les données sont rechargées automatiquement avec plus de précision</li>
            <li>🏠 <strong>Reset :</strong> Double-clic pour revenir à la vue globale</li>
            <li>🔧 <strong>Reload :</strong> Utilisez le bouton de rechargement dans la barre d'outils</li>
            <li>⚠️ <strong>Alertes :</strong> Notification automatique quand vous atteignez les bornes du dataset</li>
          </ul>
          <div style={{ marginTop: 8, padding: "6px", backgroundColor: "#fff3cd", borderRadius: "3px", fontSize: 12 }}>
            <strong>Conseils performance :</strong> Pour les gros fichiers (&gt;1M points), augmentez la limite initiale. 
            Pour les détails fins, augmentez les points zoom. Pour la fluidité, diminuez les points vue globale.
          </div>
        </div>
      )}
    </main>
  );
}