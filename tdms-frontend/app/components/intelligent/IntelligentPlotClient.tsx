"use client";

import dynamic from "next/dynamic";
import { useIntelligentPlot } from "../../hooks/useIntelligentPlot";
import BoundsAlert from "./BoundsAlert";
import PlotStatusIndicator from "./PlotStatusIndicator";
import LoadingOverlay from "./LoadingOverlay";
import { getPlotlyData, getPlotlyLayout, getPlotlyConfig } from "../../utils/plotlyConfig";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface IntelligentPlotProps {
  channelId: number;
  initialData: {
    x: (string | number)[];
    y: number[];
    title: string;
    unit?: string;
    has_time: boolean;
  };
  timeRange?: {
    min_timestamp?: number;
    max_timestamp?: number;
    min_index?: number;
    max_index?: number;
    has_time: boolean;
  };
  onZoomReload?: (range: { start: number; end: number }) => Promise<{ x: number[]; y: number[]; }>;
}

export default function IntelligentPlotClient({ 
  channelId, 
  initialData, 
  timeRange,
  onZoomReload 
}: IntelligentPlotProps) {
  // Toute la logique métier est déplacée dans le hook
  const {
    plotData,
    isLoading,
    currentDragMode,
    boundsAlert,
    handleRelayout,
    handleResetZoom,
    status
  } = useIntelligentPlot(channelId, initialData, timeRange, onZoomReload);

  return (
    <div style={{ position: "relative" }}>
      {/* Composants modulaires */}
      <BoundsAlert alert={boundsAlert} />
      <PlotStatusIndicator color={status.color} text={status.text} />
      <LoadingOverlay isLoading={isLoading} />

      {/* Graphique principal avec configuration externalisée */}
      <Plot
        data={getPlotlyData(plotData) as any}
        layout={getPlotlyLayout(plotData, currentDragMode)}
        useResizeHandler
        style={{ width: "100%", height: "60vh" }}
        config={getPlotlyConfig(handleResetZoom)}
        onRelayout={handleRelayout}
      />
      
      {/* Légende explicative */}
      <div style={{ 
        marginTop: "8px", 
        fontSize: "12px", 
        color: "#666",
        textAlign: "center"
      }}>
        💡 Zoomez pour charger plus de détails dans la zone sélectionnée • Double-clic pour revenir à la vue globale
      </div>
    </div>
  );
}