interface PlotStatusIndicatorProps {
  color: string;
  text: string;
}

export default function PlotStatusIndicator({ color, text }: PlotStatusIndicatorProps) {
  return (
    <div style={{
      position: "absolute",
      top: 10,
      left: 10,
      zIndex: 1000,
      padding: "4px 8px",
      backgroundColor: color,
      color: "white",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: 500
    }}>
      {text}
    </div>
  );
}