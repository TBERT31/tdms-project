"use client";

import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export type Series = { x: (string | number)[]; y: number[]; name: string };

export default function PlotMulti({
  series, title
}: { series: Series[]; title: string }) {
  return (
    <Plot
      data={series.map(s => ({
        x: s.x, y: s.y, name: s.name, type: "scatter", mode: "lines"
      }))}
      layout={{
        title: { text: title },
        xaxis: { automargin: true },
        yaxis: { automargin: true },
        legend: { orientation: "v" }
      }}
      useResizeHandler
      style={{ width: "100%", height: "60vh" }}
      config={{ displaylogo: false, responsive: true }}
    />
  );
}
