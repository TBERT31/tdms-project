import { Database, Clock, BarChart3, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TimeRange {
  channel_id: string;
  has_time: boolean;
  min_timestamp?: number;
  max_timestamp?: number;
  min_index?: number;
  max_index?: number;
  total_points: number;
}

interface FilteredWindowResp {
  x: number[];
  y: number[];
  unit?: string;
  has_time: boolean;
  original_points: number;
  sampled_points: number;
  has_more: boolean;
  next_cursor?: number;
  method: string;
}

interface DatasetInfoProps {
  timeRange: TimeRange | null;
  globalData: FilteredWindowResp | null;
  initialLimit: number;
}

export default function DatasetInfo({ timeRange, globalData, initialLimit }: DatasetInfoProps) {
  if (!timeRange && !globalData) return null;

  return (
    <div className="space-y-3 mb-6">
      {/* Informations sur le dataset */}
      {timeRange && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-medium text-gray-900">Dataset</h3>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {timeRange.total_points.toLocaleString()} points
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  {timeRange.has_time && timeRange.min_timestamp && timeRange.max_timestamp && (
                    <>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-600">Bornes:</span>
                        <span className="font-mono text-gray-900">
                          {timeRange.min_timestamp.toFixed(1)}s → {timeRange.max_timestamp.toFixed(1)}s
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-600">Durée:</span>
                        <span className="font-medium text-gray-900">
                          {((timeRange.max_timestamp - timeRange.min_timestamp) / 3600).toFixed(1)}h
                        </span>
                      </div>
                    </>
                  )}
                  
                  {!timeRange.has_time && timeRange.min_index !== undefined && timeRange.max_index !== undefined && (
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-gray-500" />
                      <span className="text-gray-600">Index:</span>
                      <span className="font-mono text-gray-900">
                        {timeRange.min_index} → {timeRange.max_index}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistiques temps réel */}
      {globalData && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <BarChart3 className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-medium text-gray-900">Vue actuelle</h3>
                  <Badge variant="outline" className="border-green-200 text-green-800">
                    {globalData.method.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <span>{globalData.original_points.toLocaleString()} points originaux</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-gray-900">
                    {globalData.sampled_points.toLocaleString()} points affichés
                  </span>
                </div>

                {globalData.original_points > initialLimit && (
                  <Alert variant="default" className="bg-orange-50 border-orange-200">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-orange-800">
                      Limité à {initialLimit.toLocaleString()} points. 
                      Ajustez la limite initiale pour voir plus de données.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}