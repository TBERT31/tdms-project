import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  isLoading: boolean;
}

export default function LoadingOverlay({ isLoading }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-30 rounded-lg">
      <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-medium">Rechargement des données...</span>
      </div>
    </div>
  );
}