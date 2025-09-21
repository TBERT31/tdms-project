import { useState, useEffect } from "react";

interface BackendConstraints {
  points: { min: number; max: number };
  limit: { min: number; max: number };
}

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export function useAdvancedSettings() {
  // Paramètres configurables avec valeurs par défaut des variables d'environnement
  const [globalPoints, setGlobalPoints] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_GLOBAL_POINTS) || 2000
  );
  const [zoomPoints, setZoomPoints] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM_POINTS) || 3000
  );
  const [initialLimit, setInitialLimit] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_INITIAL_LIMIT) || 100000
  );
  
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Contraintes backend (chargées dynamiquement depuis l'API)
  const [backendConstraints, setBackendConstraints] = useState<BackendConstraints>({
    points: { min: 10, max: 20000 },
    limit: { min: 10000, max: 200000 }
  });

  // Chargement des contraintes backend au démarrage
  useEffect(() => {
    const loadConstraints = async () => {
      try {
        const response = await fetch(`${API}/api/constraints`);
        if (response.ok) {
          const constraints = await response.json();
          setBackendConstraints(constraints);
          console.log("Contraintes backend chargées:", constraints);
        }
      } catch (error) {
        console.warn("Impossible de charger les contraintes backend, utilisation des valeurs par défaut:", error);
      }
    };
    loadConstraints();
  }, []);

  // Validation des paramètres
  const validateParam = (value: number, type: 'points' | 'limit') => {
    const constraints = backendConstraints[type];
    return {
      isValid: value >= constraints.min && value <= constraints.max,
      min: constraints.min,
      max: constraints.max
    };
  };

  // Fonction pour réinitialiser les paramètres par défaut
  const resetToDefaults = () => {
    setGlobalPoints(Number(process.env.NEXT_PUBLIC_DEFAULT_GLOBAL_POINTS) || 2000);
    setZoomPoints(Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM_POINTS) || 3000);
    setInitialLimit(Number(process.env.NEXT_PUBLIC_DEFAULT_INITIAL_LIMIT) || 100000);
  };

  // Validation globale
  const allParamsValid = 
    validateParam(globalPoints, 'points').isValid && 
    validateParam(zoomPoints, 'points').isValid && 
    validateParam(initialLimit, 'limit').isValid;

  return {
    // États
    globalPoints,
    setGlobalPoints,
    zoomPoints,
    setZoomPoints,
    initialLimit,
    setInitialLimit,
    showAdvancedSettings,
    setShowAdvancedSettings,
    backendConstraints,
    
    // Utilitaires
    validateParam,
    resetToDefaults,
    allParamsValid
  };
}