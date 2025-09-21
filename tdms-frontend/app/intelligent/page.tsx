"use client";
import { useEffect, useMemo } from "react";
import IntelligentPlotClient from "../components/intelligent/IntelligentPlotClient";
import UploadBox from "../components/UploadBox";
import AdvancedSettings from "../components/AdvancedSettings";
import DatasetInfo from "../components/DatasetInfo";
import { useTdmsData } from "../hooks/useTdmsData";
import { useAdvancedSettings } from "../hooks/useAdvancedSettings";

export default function IntelligentPage() {
  // Hooks pour la gestion des données
  const {
    datasets,
    datasetId,
    setDatasetId,
    channels,
    channelId,
    setChannelId,
    timeRange,
    globalData,
    loading,
    loadDatasets,
    loadTimeRange,
    loadGlobalView,
    createZoomReloadHandler
  } = useTdmsData();

  // Hooks pour les paramètres avancés
  const {
    globalPoints,
    setGlobalPoints,
    zoomPoints,
    setZoomPoints,
    initialLimit,
    setInitialLimit,
    showAdvancedSettings,
    setShowAdvancedSettings,
    backendConstraints,
    validateParam,
    resetToDefaults,
    allParamsValid
  } = useAdvancedSettings();

  // Effet pour charger automatiquement les données quand un channel change
  useEffect(() => {
    if (channelId) {
      loadTimeRange(channelId);
      loadGlobalView(channelId, globalPoints, initialLimit);
    }
  }, [channelId, globalPoints, initialLimit, loadTimeRange, loadGlobalView]);

  // Calcul du titre du channel
  const title = useMemo(() => {
    const channel = channels.find(channel => channel.id === channelId);
    return channel ? `${channel.group_name} / ${channel.channel_name}` : "Signal";
  }, [channels, channelId]);

  // Préparation des données pour le graphique
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

  // Handler pour le zoom
  const handleZoomReload = useMemo(() => 
    createZoomReloadHandler(zoomPoints), 
    [createZoomReloadHandler, zoomPoints]
  );

  return (
    <main style={{ maxWidth: 1200, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        TDMS Viewer - Zoom Intelligent
      </h1>

      {/* Header informatif */}
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

      {/* Upload de fichiers */}
      <UploadBox onDone={loadDatasets} />

      {/* Paramètres avancés */}
      <AdvancedSettings
        globalPoints={globalPoints}
        setGlobalPoints={setGlobalPoints}
        zoomPoints={zoomPoints}
        setZoomPoints={setZoomPoints}
        initialLimit={initialLimit}
        setInitialLimit={setInitialLimit}
        showAdvancedSettings={showAdvancedSettings}
        setShowAdvancedSettings={setShowAdvancedSettings}
        backendConstraints={backendConstraints}
        validateParam={validateParam}
        resetToDefaults={resetToDefaults}
        allParamsValid={allParamsValid}
      />

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
          onClick={() => channelId && loadGlobalView(channelId, globalPoints, initialLimit)} 
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
      <DatasetInfo 
        timeRange={timeRange} 
        globalData={globalData} 
        initialLimit={initialLimit} 
      />

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