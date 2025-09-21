"use client";

import dynamic from "next/dynamic";
import { useEffect, useCallback, useRef, useState } from "react";

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
  onZoomReload?: (range: { start: number; end: number }) => Promise<{ x: number[]; y: number[]; }>;
}

export default function IntelligentPlotClient({ 
  channelId, 
  initialData, 
  onZoomReload 
}: IntelligentPlotProps) {
  const [plotData, setPlotData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const lastZoomRef = useRef<{ start: number; end: number } | null>(null);
  const [currentDragMode, setCurrentDragMode] = useState<'zoom' | 'pan' | 'select' | 'lasso'>('zoom');

  useEffect(() => {
    setPlotData(initialData);
    setZoomLevel(0);
    lastZoomRef.current = null;
    setIsLoading(false);
  }, [channelId, initialData]);

  const handleRelayout = useCallback(async (eventData: any) => {
    // Détecter changement de dragmode
    if (eventData.dragmode && eventData.dragmode !== currentDragMode) {
      setCurrentDragMode(eventData.dragmode);
    }

    // Détecter si c'est un zoom sur l'axe X
    if (eventData['xaxis.range[0]'] && eventData['xaxis.range[1]'] && onZoomReload) {
      const start = Number(eventData['xaxis.range[0]']);
      const end = Number(eventData['xaxis.range[1]']);
      
      // Éviter les rechargements répétés pour la même range
      if (lastZoomRef.current?.start === start && lastZoomRef.current?.end === end) {
        return;
      }
      
      lastZoomRef.current = { start, end };
      
      console.log(`Zoom détecté: ${start} → ${end}`);
      
      setIsLoading(true);
      try {
        const newData = await onZoomReload({ start, end });
        
        setPlotData(prev => ({
          ...prev,
          x: newData.x,
          y: newData.y
        }));
        
        setZoomLevel(prev => prev + 1);
        
        console.log(`Données rechargées: ${newData.x.length} points dans la zone zoomée`);
        
      } catch (error) {
        console.error('Erreur rechargement zoom:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    // Reset sur double-clic (auto-scale)
    if (eventData['xaxis.autorange'] || eventData['yaxis.autorange']) {
      console.log('Reset zoom détecté');
      setPlotData(initialData);
      setZoomLevel(0);
      lastZoomRef.current = null;
    }
  }, [onZoomReload, initialData, currentDragMode]);

  // Indicateur de statut
  const statusColor = isLoading ? "#ff9800" : (zoomLevel > 0 ? "#4caf50" : "#2196f3");
  const statusText = isLoading ? "Rechargement..." : 
                    (zoomLevel > 0 ? `Zoom niveau ${zoomLevel}` : "Vue globale");

  return (
    <div style={{ position: "relative" }}>
      {/* Indicateur de statut */}
      <div style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 1000,
        padding: "4px 8px",
        backgroundColor: statusColor,
        color: "white",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 500
      }}>
        {statusText}
      </div>

      {/* Overlay de chargement */}
      {isLoading && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(255,255,255,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
          borderRadius: "4px"
        }}>
          <div style={{ 
            padding: "12px 20px", 
            backgroundColor: "#333", 
            color: "white", 
            borderRadius: "4px",
            fontSize: "14px"
          }}>
            Rechargement des données...
          </div>
        </div>
      )}

      <Plot
        data={[{ 
          x: plotData.x, 
          y: plotData.y, 
          type: "scatter" as const, 
          mode: "lines" as const, 
          line: { width: 1 }
        }] as any}
        layout={{
          title: { text: plotData.title },
          xaxis: { 
            automargin: true,
            title:{ text: plotData.has_time ? "Temps (s)" : "Index" }
          },
          yaxis: { 
            automargin: true,
            title: { text: plotData.unit || "Valeur" }
          },
          margin: { l: 50, r: 50, t: 50, b: 50 },
          showlegend: false,
          dragmode: currentDragMode  
        }}
        useResizeHandler
        style={{ width: "100%", height: "60vh" }}
        config={{ 
          displaylogo: false, 
          responsive: true,
          modeBarButtonsToAdd: [{
            name: 'Reload data',
            title: 'Retour à la vue globale',
            icon: {
              width: 24,
              height: 24,
              path: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z'
            },
            click: () => {
              setPlotData(initialData);
              setZoomLevel(0);
              lastZoomRef.current = null;
            }
          }]
        }}
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