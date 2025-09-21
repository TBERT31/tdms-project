import { ChevronDown, ChevronRight, Settings, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const globalPointsValidation = validateParam(globalPoints, 'points');
  const zoomPointsValidation = validateParam(zoomPoints, 'points');
  const initialLimitValidation = validateParam(initialLimit, 'limit');

  return (
    <Card className="mb-6">
      <Collapsible open={showAdvancedSettings} onOpenChange={setShowAdvancedSettings}>
        <CollapsibleTrigger asChild>
          <CardHeader className="hover:bg-gray-50 transition-colors cursor-pointer pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <CardTitle className="text-lg">Paramètres avancés</CardTitle>
                {!allParamsValid && (
                  <Badge variant="destructive" className="ml-2">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Erreurs
                  </Badge>
                )}
                {allParamsValid && showAdvancedSettings && (
                  <Badge variant="default" className="ml-2 bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Valide
                  </Badge>
                )}
              </div>
              {showAdvancedSettings ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
            {!showAdvancedSettings && (
              <CardDescription>
                Configurez les limites de points et la performance selon vos fichiers
              </CardDescription>
            )}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Points vue globale */}
              <div className="space-y-2">
                <Label htmlFor="globalPoints" className="text-sm font-medium">
                  Points vue globale
                </Label>
                <Input
                  id="globalPoints"
                  type="number"
                  value={globalPoints}
                  onChange={(e) => setGlobalPoints(Number(e.target.value))}
                  min={backendConstraints.points.min}
                  max={backendConstraints.points.max}
                  className={
                    !globalPointsValidation.isValid 
                      ? "border-red-500 focus:border-red-500 bg-red-50" 
                      : ""
                  }
                />
                {!globalPointsValidation.isValid && (
                  <Alert variant="destructive" className="p-2">
                    <AlertTriangle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      Entre {backendConstraints.points.min} et {backendConstraints.points.max.toLocaleString()}
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground">
                  Recommandé: 1 000 - 5 000
                </p>
              </div>

              {/* Points zoom détaillé */}
              <div className="space-y-2">
                <Label htmlFor="zoomPoints" className="text-sm font-medium">
                  Points zoom détaillé
                </Label>
                <Input
                  id="zoomPoints"
                  type="number"
                  value={zoomPoints}
                  onChange={(e) => setZoomPoints(Number(e.target.value))}
                  min={backendConstraints.points.min}
                  max={backendConstraints.points.max}
                  className={
                    !zoomPointsValidation.isValid 
                      ? "border-red-500 focus:border-red-500 bg-red-50" 
                      : ""
                  }
                />
                {!zoomPointsValidation.isValid && (
                  <Alert variant="destructive" className="p-2">
                    <AlertTriangle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      Entre {backendConstraints.points.min} et {backendConstraints.points.max.toLocaleString()}
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground">
                  Recommandé: 2 000 - 10 000
                </p>
              </div>

              {/* Limite initiale */}
              <div className="space-y-2">
                <Label htmlFor="initialLimit" className="text-sm font-medium">
                  Limite initiale lecture
                </Label>
                <Input
                  id="initialLimit"
                  type="number"
                  value={initialLimit}
                  onChange={(e) => setInitialLimit(Number(e.target.value))}
                  min={backendConstraints.limit.min}
                  max={backendConstraints.limit.max}
                  step={10000}
                  className={
                    !initialLimitValidation.isValid 
                      ? "border-red-500 focus:border-red-500 bg-red-50" 
                      : ""
                  }
                />
                {!initialLimitValidation.isValid && (
                  <Alert variant="destructive" className="p-2">
                    <AlertTriangle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      Entre {backendConstraints.limit.min.toLocaleString()} et {backendConstraints.limit.max.toLocaleString()}
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground">
                  Max {backendConstraints.limit.max.toLocaleString()} (limite backend)
                </p>
              </div>

              {/* Contrôles */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Contrôles</Label>
                <div className="space-y-2">
                  <Button
                    onClick={resetToDefaults}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Réinitialiser
                  </Button>

                  <div className={`
                    p-2 rounded-md text-xs text-center font-medium border
                    ${allParamsValid 
                      ? 'bg-green-50 text-green-800 border-green-200' 
                      : 'bg-red-50 text-red-800 border-red-200'
                    }
                  `}>
                    {allParamsValid ? (
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Paramètres valides
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Erreurs détectées
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Conseils de performance */}
            <Alert className="mt-4 bg-blue-50 border-blue-200">
              <Settings className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Conseils performance :</strong> Pour les gros fichiers (&gt;1M points), 
                augmentez la limite initiale. Pour les détails fins, augmentez les points zoom. 
                Pour la fluidité, diminuez les points vue globale.
              </AlertDescription>
            </Alert>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}