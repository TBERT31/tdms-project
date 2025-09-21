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
  timeRange?: {
    min_timestamp?: number;
    max_timestamp?: number;
    min_index?: number;
    max_index?: number;
    has_time: boolean;
  };
  onZoomReload?: (range: { start: number; end: number }) => Promise<{ x: number[]; y: number[]; }>;
}

interface BoundsAlert {
  message: string;
  type: 'min' | 'max';
  timestamp: number;
}

export default function IntelligentPlotClient({ 
  channelId, 
  initialData, 
  timeRange,
  onZoomReload 
}: IntelligentPlotProps) {
  const [plotData, setPlotData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const lastZoomRef = useRef<{ start: number; end: number } | null>(null);
  const [currentDragMode, setCurrentDragMode] = useState<'zoom' | 'pan' | 'select' | 'lasso'>('zoom');
  const [boundsAlert, setBoundsAlert] = useState<BoundsAlert | null>(null);

  useEffect(() => {
    setPlotData(initialData);
    setZoomLevel(0);
    lastZoomRef.current = null;
    setIsLoading(false);
    setBoundsAlert(null);
  }, [channelId, initialData]);

  // Auto-dismiss alert après 3 secondes
  useEffect(() => {
    if (boundsAlert) {
      const timer = setTimeout(() => {
        setBoundsAlert(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [boundsAlert]);

  const checkBounds = useCallback((start: number, end: number) => {
    if (!timeRange) return { start, end };

    const minBound = timeRange.has_time ? timeRange.min_timestamp! : timeRange.min_index!;
    const maxBound = timeRange.has_time ? timeRange.max_timestamp! : timeRange.max_index!;
    
    if (start < minBound) {
      setBoundsAlert({
        message: `Début du dataset atteint (${minBound.toFixed(1)}${timeRange.has_time ? 's' : ''})`,
        type: 'min',
        timestamp: Date.now()
      });
      console.warn(`Borne min dépassée: ${start} < ${minBound}`);
    }
    
    if (end > maxBound) {
      setBoundsAlert({
        message: `Fin du dataset atteinte (${maxBound.toFixed(1)}${timeRange.has_time ? 's' : ''})`,
        type: 'max',
        timestamp: Date.now()
      });
      console.warn(`Borne max dépassée: ${end} > ${maxBound}`);
    }

    return { start, end };
  }, [timeRange]);

  const handleRelayout = useCallback(async (eventData: any) => {
    // Détecter changement de dragmode
    if (eventData.dragmode && eventData.dragmode !== currentDragMode) {
      setCurrentDragMode(eventData.dragmode);
    }

    // Détecter si c'est un zoom/pan sur l'axe X
    if (eventData['xaxis.range[0]'] && eventData['xaxis.range[1]'] && onZoomReload) {
      const start = Number(eventData['xaxis.range[0]']);
      const end = Number(eventData['xaxis.range[1]']);
      
      // Vérifier les bornes et afficher alerte si nécessaire
      checkBounds(start, end);
      
      // Éviter les rechargements répétés pour la même range
      if (lastZoomRef.current?.start === start && lastZoomRef.current?.end === end) {
        return;
      }
      
      lastZoomRef.current = { start, end };
      
      console.log(`Navigation détectée: ${start.toFixed(2)} → ${end.toFixed(2)}`);
      
      setIsLoading(true);
      try {
        const newData = await onZoomReload({ start, end });
        
        setPlotData(prev => ({
          ...prev,
          x: newData.x,
          y: newData.y
        }));
        
        setZoomLevel(prev => prev + 1);
        
        console.log(`Données rechargées: ${newData.x.length} points dans la zone`);
        
      } catch (error) {
        console.error('Erreur rechargement:', error);
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
      setBoundsAlert(null);
    }
  }, [onZoomReload, initialData, currentDragMode, checkBounds]);

  // Indicateur de statut
  const statusColor = isLoading ? "#ff9800" : (zoomLevel > 0 ? "#4caf50" : "#2196f3");
  const statusText = isLoading ? "Rechargement..." : 
                    (zoomLevel > 0 ? `Zoom niveau ${zoomLevel}` : "Vue globale");

  return (
    <div style={{ position: "relative" }}>
      {/* Alerte de dépassement de bornes */}
      {boundsAlert && (
        <div style={{
          position: "absolute",
          top: 50,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1001,
          padding: "8px 16px",
          backgroundColor: boundsAlert.type === 'min' ? "#f44336" : "#ff9800",
          color: "white",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 500,
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,255,255,0.2)",
          animation: "fadeIn 0.3s ease-out"
        }}>
          ⚠️ {boundsAlert.message}
        </div>
      )}

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
              setBoundsAlert(null);
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

      {/* CSS Animation pour l'alerte */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}