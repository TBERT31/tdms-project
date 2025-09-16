"use client";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export type Series = { x: (number|string)[]; y: number[]; name: string };

export default function PlotStack2({
  top, bottom, yTop, yBottom
}:{
  top: Series; bottom: Series; yTop: string; yBottom: string;
}) {
  return (
    <Plot
      data={[
        { ...top,    type: "scatter", mode: "lines", yaxis: "y"  },
        { ...bottom, type: "scatter", mode: "lines", yaxis: "y2" },
      ]}
      layout={{
        grid: { rows: 2, columns: 1, pattern: "independent" },
        xaxis:  { automargin: true, title: { text: "Time" } },
        xaxis2: { automargin: true, matches: "x" }, 
        yaxis:  { automargin: true, title: { text: yTop } },
        yaxis2: { automargin: true, title: { text: yBottom } },
        showlegend: false,
        margin: { t: 20 }
      }}
      useResizeHandler
      style={{ width: "100%", height: "70vh" }}
      config={{ displaylogo: false, responsive: true }}
    />
  );
}
