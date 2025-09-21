import { Activity, Zap, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PlotStatusIndicatorProps {
  color: string;
  text: string;
}

export default function PlotStatusIndicator({ color, text }: PlotStatusIndicatorProps) {
  const getIcon = () => {
    if (text.includes("Rechargement")) return <Activity className="h-3 w-3 animate-pulse" />;
    if (text.includes("Zoom")) return <Zap className="h-3 w-3" />;
    return <Eye className="h-3 w-3" />;
  };

  const getVariant = () => {
    if (text.includes("Rechargement")) return "secondary";
    if (text.includes("Zoom")) return "default";
    return "outline";
  };

  return (
    <div className="absolute top-3 left-3 z-40">
      <Badge variant={getVariant()} className="flex items-center gap-1 font-medium shadow-sm">
        {getIcon()}
        {text}
      </Badge>
    </div>
  );
}
