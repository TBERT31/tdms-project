"use client";

import { useEffect, useMemo, useState } from "react";
import PlotMulti, { Series } from "../components/PlotMulti";
import type { Dataset, Channel } from "../types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type DsWithChannels = Dataset & { channels: Channel[] };

export default function CompareGlobalPage() {
  const [all, setAll] = useState<DsWithChannels[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [points, setPoints] = useState(2000);
  const [agg, setAgg] = useState<"mean"|"max"|"min">("max");
  const [series, setSeries] = useState<Series[]|null>(null);
  const [loading, setLoading] = useState(false);

  // Load every dataset + its channels
  useEffect(() => {
    (async () => {
      const r = await fetch(`${API}/datasets`, { cache: "no-store" });
      const ds: Dataset[] = await r.json();
      const withCh = await Promise.all(
        ds.map(async d => {
          const rc = await fetch(`${API}/datasets/${d.id}/channels`, { cache: "no-store" });
          const ch: Channel[] = await rc.json();
          return { ...d, channels: ch } as DsWithChannels;
        })
      );
      setAll(withCh);
    })();
  }, []);

  const totalSelected = selected.size;

  function toggle(id: number) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  function selectAll(ds: DsWithChannels) {
    const s = new Set(selected);
    ds.channels.forEach(c => s.add(c.id));
    setSelected(s);
  }
  function clearAll(ds: DsWithChannels) {
    const s = new Set(selected);
    ds.channels.forEach(c => s.delete(c.id));
    setSelected(s);
  }

  async function compare() {
    if (!selected.size) return;
    setLoading(true);
    try {
      const ids = Array.from(selected).join(",");
      const r = await fetch(`${API}/multi_window?channel_ids=${ids}&points=${points}&agg=${agg}`, { cache:"no-store" });
      const j = await r.json(); // { series: [{name, x, y}] }
      // PlotMulti accepts Series[] directly
      setSeries(j.series);
    } finally {
      setLoading(false);
    }
  }

  const title = useMemo(
    () => `Comparaison (${totalSelected} trace${totalSelected>1?"s":""})`,
    [totalSelected]
  );

  return (
    <main style={{maxWidth:1100, margin:"24px auto", padding:"0 16px"}}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12}}>
        <h1 style={{fontSize:22, fontWeight:700, margin:0}}>TDMS — Comparaison globale (multi-datasets)</h1>
        <a href="/" style={{marginLeft:"auto"}}>← Retour au viewer simple</a>
      </div>

      <div style={{display:"flex", gap:16, flexWrap:"wrap", alignItems:"center", marginBottom:8}}>
        <span>Points (downsampling):&nbsp;
          <input type="number" min={10} max={20000} value={points}
                 onChange={e=>setPoints(Number(e.target.value))} style={{width:100}}/>
        </span>
        <span> Agrégat:&nbsp;
          <select value={agg} onChange={e=>setAgg(e.target.value as any)}>
            <option value="mean">mean</option>
            <option value="max">max</option>
            <option value="min">min</option>
          </select>
        </span>
        <button onClick={compare} disabled={!selected.size || loading}>
          {loading ? "Chargement…" : `Comparer (${totalSelected})`}
        </button>
      </div>

      {/* Datasets & channels list */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:12}}>
        {all.map(ds => (
          <fieldset key={ds.id} style={{border:"1px solid #ddd", borderRadius:8, padding:12}}>
            <legend style={{fontWeight:600}}>
              {ds.id} — {ds.filename}
            </legend>

            <div style={{display:"flex", gap:8, fontSize:12, marginBottom:6}}>
              <a onClick={()=>selectAll(ds)} style={{cursor:"pointer"}}>Tout sélectionner</a>
              <span>·</span>
              <a onClick={()=>clearAll(ds)} style={{cursor:"pointer"}}>Effacer sélection</a>
            </div>

            <div style={{display:"grid", gap:6}}>
              {ds.channels.map(c => (
                <label key={c.id} style={{display:"flex", gap:8, alignItems:"start"}}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={()=>toggle(c.id)}
                  />
                  <div>
                    <div style={{fontSize:13, fontWeight:600}}>
                      {c.group_name}
                    </div>
                    <div style={{fontSize:12}}>
                      {c.channel_name} — {c.n_rows} pts
                      {c.has_time ? " · time" : " · index"}
                      {c.unit ? ` · ${c.unit}` : ""}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div style={{marginTop:28}}>
        {!series && <div>Sélectionne des canaux (de n’importe quels datasets) puis clique “Comparer”.</div>}
        {series && <PlotMulti series={series} title={title} />}
      </div>
    </main>
  );
}
