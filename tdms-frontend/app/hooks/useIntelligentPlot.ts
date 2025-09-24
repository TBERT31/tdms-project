import { useState, useEffect, useCallback, useRef } from "react";

interface IntelligentPlotData {
  x: (string | number)[];
  y: number[];
  title: string;
  unit?: string;
  has_time: boolean;
}

interface TimeRange {
  min_timestamp?: number;
  max_timestamp?: number;
  min_index?: number;
  max_index?: number;
  has_time: boolean;
}

interface BoundsAlert {
  message: string;
  type: 'min' | 'max';
  timestamp: number;
}

type DragMode = 'zoom' | 'pan' | 'select' | 'lasso' | 'drawclosedpath' | 'drawopenpath' | 'drawline' | 'drawrect' | 'drawcircle' | 'orbit' | 'turntable' | false;

export function useIntelligentPlot(
  channelId: string,
  initialData: IntelligentPlotData,
  timeRange?: TimeRange,
  onZoomReload?: (range: { start: number; end: number }) => Promise<{ x: number[]; y: number[]; }>
) {
  const [plotData, setPlotData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [currentDragMode, setCurrentDragMode] = useState<DragMode>('zoom');
  const [boundsAlert, setBoundsAlert] = useState<BoundsAlert | null>(null);
  
  const lastZoomRef = useRef<{ start: number; end: number } | null>(null);

  // Reset des données quand le channel change
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

  // Vérification des bornes avec alertes
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

  // Gestionnaire principal des interactions Plotly
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
      handleResetZoom();
    }
  }, [onZoomReload, initialData, currentDragMode, checkBounds]);

  // Fonction de reset accessible depuis l'extérieur
  const handleResetZoom = useCallback(() => {
    setPlotData(initialData);
    setZoomLevel(0);
    lastZoomRef.current = null;
    setBoundsAlert(null);
  }, [initialData]);

  return {
    // États
    plotData,
    isLoading,
    zoomLevel,
    currentDragMode,
    boundsAlert,
    
    // Handlers
    handleRelayout,
    handleResetZoom,
    
    // Utilitaires
    status: {
      color: isLoading ? "#ff9800" : (zoomLevel > 0 ? "#4caf50" : "#2196f3"),
      text: isLoading ? "Rechargement..." : (zoomLevel > 0 ? `Zoom niveau ${zoomLevel}` : "Vue globale")
    }
  };
}