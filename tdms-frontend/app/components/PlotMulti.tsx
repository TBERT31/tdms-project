"use client";
import dynamic from "next/dynamic";
import type { Layout } from "plotly.js";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export type Series = { x: (number | string)[]; y: number[]; name: string };

export default function PlotMulti({
  series,
  title,
}: {
  series: Series[];
  title: string;
}) {
  const layout: Partial<Layout> = {
    title: { text: title },
    xaxis: { automargin: true, title: { text: "Time (s)" } },
    yaxis: { automargin: true }, // or: { automargin: true, title: { text: "Amplitude" } }
    legend: { orientation: "v" },
  };

  return (
    <Plot
      data={series.map((s) => ({ ...s, type: "scatter", mode: "lines" }))}
      layout={layout}
      useResizeHandler
      style={{ width: "100%", height: "60vh" }}
      config={{ displaylogo: false, responsive: true }}
    />
  );
}
