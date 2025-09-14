"use client";

import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export default function PlotClient({
  x, y, title
}: { x: (string|number)[]; y: number[]; title: string }) {
  return (
    <Plot
      data={[{ x, y, type: "scatter", mode: "lines", name: "signal" }]}
      layout={{ title: { text: title }, xaxis: { automargin: true }, yaxis: { automargin: true } }}
      useResizeHandler
      style={{ width: "100%", height: "60vh" }}
      config={{ displaylogo: false, responsive: true }}
    />
  );
}
