interface AdvancedSettingsProps {
  globalPoints: number;
  setGlobalPoints: (value: number) => void;
  zoomPoints: number;
  setZoomPoints: (value: number) => void;
  initialLimit: number;
  setInitialLimit: (value: number) => void;
  showAdvancedSettings: boolean;
  setShowAdvancedSettings: (show: boolean) => void;
  backendConstraints: {
    points: { min: number; max: number };
    limit: { min: number; max: number };
  };
  validateParam: (value: number, type: 'points' | 'limit') => {
    isValid: boolean;
    min: number;
    max: number;
  };
  resetToDefaults: () => void;
  allParamsValid: boolean;
}

export default function AdvancedSettings({
  globalPoints,
  setGlobalPoints,
  zoomPoints,
  setZoomPoints,
  initialLimit,
  setInitialLimit,
  showAdvancedSettings,
  setShowAdvancedSettings,
  backendConstraints,
  validateParam,
  resetToDefaults,
  allParamsValid
}: AdvancedSettingsProps) {
  return (
    <div style={{ 
      marginBottom: 16, 
      padding: "12px", 
      backgroundColor: "#f8f9fa", 
      border: "1px solid #dee2e6", 
      borderRadius: "4px" 
    }}>
      <button 
        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
        style={{
          backgroundColor: "transparent",
          border: "none",
          color: "#007bff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500
        }}
      >
        {showAdvancedSettings ? "▼" : "▶"} Paramètres avancés
      </button>

      {showAdvancedSettings && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {/* Points vue globale */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>
              Points vue globale:
            </span>
            <input
              type="number"
              value={globalPoints}
              onChange={(e) => setGlobalPoints(Number(e.target.value))}
              min={backendConstraints.points.min}
              max={backendConstraints.points.max}
              style={{ 
                padding: "6px 8px", 
                border: validateParam(globalPoints, 'points').isValid ? "1px solid #ddd" : "2px solid #dc3545", 
                borderRadius: "3px",
                fontSize: 13,
                backgroundColor: validateParam(globalPoints, 'points').isValid ? "white" : "#fff5f5"
              }}
            />
            {!validateParam(globalPoints, 'points').isValid && (
              <span style={{ fontSize: 11, color: "#dc3545", fontWeight: 500 }}>
                ⚠️ Doit être entre {backendConstraints.points.min} et {backendConstraints.points.max.toLocaleString()}
              </span>
            )}
            <span style={{ fontSize: 11, color: "#666" }}>
              Recommandé: 1000-5000
            </span>
          </label>

          {/* Points zoom détaillé */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>
              Points zoom détaillé:
            </span>
            <input
              type="number"
              value={zoomPoints}
              onChange={(e) => setZoomPoints(Number(e.target.value))}
              min={backendConstraints.points.min}
              max={backendConstraints.points.max}
              style={{ 
                padding: "6px 8px", 
                border: validateParam(zoomPoints, 'points').isValid ? "1px solid #ddd" : "2px solid #dc3545", 
                borderRadius: "3px",
                fontSize: 13,
                backgroundColor: validateParam(zoomPoints, 'points').isValid ? "white" : "#fff5f5"
              }}
            />
            {!validateParam(zoomPoints, 'points').isValid && (
              <span style={{ fontSize: 11, color: "#dc3545", fontWeight: 500 }}>
                ⚠️ Doit être entre {backendConstraints.points.min} et {backendConstraints.points.max.toLocaleString()}
              </span>
            )}
            <span style={{ fontSize: 11, color: "#666" }}>
              Recommandé: 2000-10000
            </span>
          </label>

          {/* Limite initiale lecture */}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>
              Limite initiale lecture:
            </span>
            <input
              type="number"
              value={initialLimit}
              onChange={(e) => setInitialLimit(Number(e.target.value))}
              min={backendConstraints.limit.min}
              max={backendConstraints.limit.max}
              step={10000}
              style={{ 
                padding: "6px 8px", 
                border: validateParam(initialLimit, 'limit').isValid ? "1px solid #ddd" : "2px solid #dc3545", 
                borderRadius: "3px",
                fontSize: 13,
                backgroundColor: validateParam(initialLimit, 'limit').isValid ? "white" : "#fff5f5"
              }}
            />
            {!validateParam(initialLimit, 'limit').isValid && (
              <span style={{ fontSize: 11, color: "#dc3545", fontWeight: 500 }}>
                ⚠️ Doit être entre {backendConstraints.limit.min.toLocaleString()} et {backendConstraints.limit.max.toLocaleString()}
              </span>
            )}
            <span style={{ fontSize: 11, color: "#666" }}>
              Max {backendConstraints.limit.max.toLocaleString()} (limite backend actuelle)
            </span>
          </label>

          {/* Contrôles */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }}>
            <button
              onClick={resetToDefaults}
              style={{
                padding: "6px 12px",
                backgroundColor: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "3px",
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              Réinitialiser
            </button>

            {/* Indicateur de validation global */}
            <div style={{
              padding: "6px 8px",
              borderRadius: "3px",
              fontSize: 11,
              textAlign: "center",
              fontWeight: 500,
              backgroundColor: allParamsValid ? "#d4edda" : "#f8d7da",
              color: allParamsValid ? "#155724" : "#721c24",
              border: allParamsValid ? "1px solid #c3e6cb" : "1px solid #f5c6cb"
            }}>
              {allParamsValid ? "✓ Paramètres valides" : "⚠️ Erreurs détectées"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}