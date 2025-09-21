import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BoundsAlert {
  message: string;
  type: 'min' | 'max';
  timestamp: number;
}

interface BoundsAlertProps {
  alert: BoundsAlert | null;
}

export default function BoundsAlert({ alert }: BoundsAlertProps) {
  if (!alert) return null;

  return (
    <div className="absolute top-12 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
      <Alert 
        variant="destructive" 
        className={`
          shadow-lg border-2 min-w-max
          ${alert.type === 'min' ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-300'}
        `}
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="font-medium">
          {alert.message}
        </AlertDescription>
      </Alert>
    </div>
  );
}