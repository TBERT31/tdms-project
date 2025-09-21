"use client";
import { useRef, useState } from "react";
import { Upload, FileUp, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function UploadBox({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);

  async function upload() {
    const f = inputRef.current?.files?.[0];
    if (!f) return;
    setBusy(true); 
    setMsg("Upload & ingestion…");
    
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/ingest`, { 
        method: "POST", 
        body: fd 
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Dataset ingéré avec succès");
      onDone();
    } catch (e: any) {
      setMsg(`Erreur: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.tdms')) {
        if (inputRef.current) {
          inputRef.current.files = e.dataTransfer.files;
        }
      }
    }
  };

  const selectedFile = inputRef.current?.files?.[0];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          Ingestion TDMS
        </CardTitle>
        <CardDescription>
          Uploadez un fichier .tdms pour commencer l'analyse
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Zone de drag & drop */}
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
            ${dragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            <span className="font-medium">Cliquez pour sélectionner</span> ou glissez-déposez
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Fichiers .tdms uniquement
          </p>
          
          <input
            ref={inputRef}
            type="file"
            accept=".tdms"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={() => setMsg("")}
          />
        </div>

        {/* Fichier sélectionné */}
        {selectedFile && (
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <FileUp className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                {selectedFile.name}
              </span>
              <span className="text-xs text-blue-600">
                ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
            
            <Button 
              onClick={upload} 
              disabled={busy}
              size="sm"
              className="ml-4"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  En cours...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Uploader
                </>
              )}
            </Button>
          </div>
        )}

        {/* Messages de statut */}
        {msg && (
          <Alert className={
            msg.includes("succès") || msg.includes("✅") 
              ? "border-green-200 bg-green-50" 
              : msg.includes("Erreur") 
                ? "border-red-200 bg-red-50"
                : "border-blue-200 bg-blue-50"
          }>
            {msg.includes("succès") || msg.includes("✅") ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : msg.includes("Erreur") ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            )}
            <AlertDescription className={
              msg.includes("succès") || msg.includes("✅") 
                ? "text-green-800" 
                : msg.includes("Erreur") 
                  ? "text-red-800"
                  : "text-blue-800"
            }>
              {msg}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}