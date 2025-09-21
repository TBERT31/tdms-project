interface TimeRange {
  channel_id: number;
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
  return (
    <>
      {/* Informations sur le dataset */}
      {timeRange && (
        <div style={{ 
          padding: "8px 12px", 
          backgroundColor: "#f5f5f5", 
          borderRadius: "4px", 
          marginBottom: 12,
          fontSize: 13,
          color: "#555"
        }}>
          <strong>Dataset:</strong> {timeRange.total_points.toLocaleString()} points total
          {timeRange.has_time && timeRange.min_timestamp && timeRange.max_timestamp && (
            <>
              {" • "}
              <strong>Bornes:</strong> {timeRange.min_timestamp.toFixed(1)}s → {timeRange.max_timestamp.toFixed(1)}s
              {" • "}
              <strong>Durée:</strong> {((timeRange.max_timestamp - timeRange.min_timestamp) / 3600).toFixed(1)}h
            </>
          )}
          {!timeRange.has_time && timeRange.min_index !== undefined && timeRange.max_index !== undefined && (
            <>
              {" • "}
              <strong>Index:</strong> {timeRange.min_index} → {timeRange.max_index}
            </>
          )}
        </div>
      )}

      {/* Statistiques temps réel */}
      {globalData && (
        <div style={{ 
          marginBottom: 12, 
          padding: "8px", 
          backgroundColor: "#f0f8ff", 
          borderRadius: "4px",
          fontSize: 12
        }}>
          <strong>Vue actuelle:</strong> {globalData.original_points.toLocaleString()} → {globalData.sampled_points.toLocaleString()} points 
          (algorithme {globalData.method})
          {globalData.original_points > initialLimit && (
            <span style={{ color: "#ff6b35", marginLeft: 8 }}>
              ⚠️ Limité à {initialLimit.toLocaleString()} pts (ajustez la limite initiale si nécessaire)
            </span>
          )}
        </div>
      )}
    </>
  );
}