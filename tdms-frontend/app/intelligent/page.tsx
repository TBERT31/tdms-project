"use client";
import { useEffect, useMemo } from "react";
import { Zap, Database, RefreshCw, Info } from "lucide-react";
import IntelligentPlotClient from "../components/intelligent/IntelligentPlotClient";
import UploadBox from "../components/UploadBox";
import AdvancedSettings from "../components/AdvancedSettings";
import DatasetInfo from "../components/DatasetInfo";
import { useTdmsData } from "../hooks/useTdmsData";
import { useAdvancedSettings } from "../hooks/useAdvancedSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

  const canReload = channelId && 
    validateParam(globalPoints, 'points').isValid && 
    validateParam(initialLimit, 'limit').isValid;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                TDMS Viewer
              </h1>
              <p className="text-gray-600">Zoom Intelligent</p>
            </div>
          </div>

          {/* Mode intelligent info */}
          <Alert className="bg-green-50 border-green-200">
            <Zap className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Mode Intelligent:</strong> Vue globale ({globalPoints.toLocaleString()} pts) puis rechargement automatique 
              avec plus de détails ({zoomPoints.toLocaleString()} pts) lors du zoom. 
              Limite initiale: {initialLimit.toLocaleString()} pts.
            </AlertDescription>
          </Alert>
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
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Sélection des données
            </CardTitle>
            <CardDescription>
              Choisissez un dataset et un canal pour commencer l'analyse
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-gray-700">Dataset</label>
                <Select 
                  value={datasetId?.toString() ?? ""} 
                  onValueChange={(value) => setDatasetId(Number(value))}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un dataset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map(dataset => (
                      <SelectItem key={dataset.id} value={dataset.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{dataset.id}</Badge>
                          {dataset.filename}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-gray-700">Channel</label>
                <Select 
                  value={channelId?.toString() ?? ""} 
                  onValueChange={(value) => setChannelId(Number(value))}
                  disabled={loading || !channels.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un canal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map(channel => (
                      <SelectItem key={channel.id} value={channel.id.toString()}>
                        <div className="flex items-center justify-between w-full">
                          <span>{channel.group_name} — {channel.channel_name}</span>
                          <Badge variant="secondary" className="ml-2">
                            {channel.n_rows.toLocaleString()}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={() => channelId && loadGlobalView(channelId, globalPoints, initialLimit)} 
                disabled={!canReload || loading}
                className="min-w-fit"
              >
                {loading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Chargement...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Recharger
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Informations sur le dataset */}
        <DatasetInfo 
          timeRange={timeRange} 
          globalData={globalData} 
          initialLimit={initialLimit} 
        />

        {/* Graphique intelligent */}
        {!plotData && !loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Sélectionnez un canal pour commencer
              </h3>
              <p className="text-gray-600">
                Choisissez un dataset et un canal pour explorer vos données TDMS
              </p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <RefreshCw className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Chargement de la vue globale...
              </h3>
              <p className="text-gray-600">
                Préparation des données pour l'affichage
              </p>
            </CardContent>
          </Card>
        )}

        {plotData && channelId && timeRange && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <IntelligentPlotClient
                key={`${channelId}-${globalPoints}-${zoomPoints}`}    
                channelId={channelId}
                initialData={plotData}
                timeRange={timeRange}
                onZoomReload={handleZoomReload}
              />
            </CardContent>
          </Card>
        )}

        {/* Guide d'utilisation */}
        {plotData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Guide d'utilisation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🔧</Badge>
                    <span className="font-medium">Paramètres</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Ajustez les paramètres avancés pour optimiser selon vos fichiers
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🔍</Badge>
                    <span className="font-medium">Zoom</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Cliquez-glissez sur le graphique pour zoomer
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🔄</Badge>
                    <span className="font-medium">Rechargement auto</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Les données sont rechargées automatiquement avec plus de précision
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🏠</Badge>
                    <span className="font-medium">Reset</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Double-clic pour revenir à la vue globale
                  </p>
                </div>
              </div>

              <Alert className="bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>Conseils performance :</strong> Pour les gros fichiers (&gt;1M points), 
                  augmentez la limite initiale. Pour les détails fins, augmentez les points zoom. 
                  Pour la fluidité, diminuez les points vue globale.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}