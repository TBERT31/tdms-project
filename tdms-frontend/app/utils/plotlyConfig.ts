interface PlotData {
  x: (string | number)[];
  y: number[];
  title: string;
  unit?: string;
  has_time: boolean;
}

type DragMode = 'zoom' | 'pan' | 'select' | 'lasso' | 'drawclosedpath' | 'drawopenpath' | 'drawline' | 'drawrect' | 'drawcircle' | 'orbit' | 'turntable' | false;

export function getPlotlyData(plotData: PlotData) {
  return [{
    x: plotData.x,
    y: plotData.y,
    type: "scatter" as const,
    mode: "lines" as const,
    line: { width: 1 }
  }];
}

export function getPlotlyLayout(plotData: PlotData, currentDragMode: DragMode) {
  return {
    title: { text: plotData.title },
    xaxis: {
      automargin: true,
      title: { text: plotData.has_time ? "Temps (s)" : "Index" }
    },
    yaxis: {
      automargin: true,
      title: { text: plotData.unit || "Valeur" }
    },
    margin: { l: 50, r: 50, t: 50, b: 50 },
    showlegend: false,
    dragmode: currentDragMode
  };
}

export function getPlotlyConfig(onResetClick: () => void) {
  return {
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
      click: onResetClick
    }]
  };
}