"use client";
import { useRef, useState } from "react";

export default function UploadBox({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function upload() {
    const f = inputRef.current?.files?.[0];
    if (!f) return;
    setBusy(true); setMsg("Upload & ingestion…");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/ingest`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setMsg("OK, dataset ingéré ✅");
      onDone();
    } catch (e:any) {
      setMsg(`Erreur: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border:"1px solid #ddd", borderRadius:12, padding:16, marginBottom:16 }}>
      <b>Ingestion TDMS</b>
      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        <input ref={inputRef} type="file" accept=".tdms" />
        <button onClick={upload} disabled={busy}>
          {busy ? "En cours…" : "Uploader"}
        </button>
      </div>
      {msg && <div style={{ marginTop:8, fontSize:12, color:"#555" }}>{msg}</div>}
    </div>
  );
}
