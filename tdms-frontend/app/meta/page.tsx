"use client";

import { useEffect, useMemo, useState } from "react";
import PlotMulti, { Series } from "../components/PlotMulti";

type Dataset = { id:number; filename:string };
type Channel = {
  id:number; dataset_id:number; group_name:string; channel_name:string;
  n_rows:number; parquet_path:string; has_time:boolean; unit:string|null
};
type WindowResp = { x:(string|number)[]; y:number[]; unit:string|null; has_time:boolean };

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function MetaPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dsId, setDsId] = useState<number|"">("");

  const [channels, setChannels] = useState<Channel[]>([]);
  const [group, setGroup] = useState<string>("");

  const [meta, setMeta] = useState<any>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);

  // load datasets once
  useEffect(() => {
    (async () => {
      const r = await fetch(`${API}/datasets`, { cache:"no-store" });
      const j = await r.json();
      setDatasets(j);
      if (j?.length) setDsId(j[0].id);
    })();
  }, []);

  // when dataset changes: load channels + metadata
  useEffect(() => {
    if (!dsId) return;
    (async () => {
      const [rch, rmeta] = await Promise.all([
        fetch(`${API}/datasets/${dsId}/channels`, { cache:"no-store" }),
        fetch(`${API}/dataset_meta?dataset_id=${dsId}`, { cache:"no-store" }),
      ]);
      const ch = await rch.json();
      setChannels(ch);

      const m = await rmeta.json();
      setMeta(m);
      const groups = Object.keys(m.group_properties ?? {});
      setGroup(groups[0] ?? (ch[0]?.group_name ?? ""));
    })();
  }, [dsId]);

  // load all channels of selected group
  useEffect(() => {
    if (!group) { setSeries([]); return; }
    const chs = channels.filter(c => c.group_name === group);
    if (!chs.length) { setSeries([]); return; }

    (async () => {
      setLoading(true);
      try {
        const datas = await Promise.all(
          chs.map(c => fetch(`${API}/window?channel_id=${c.id}&points=2000`, { cache:"no-store" }).then(r=>r.json() as Promise<WindowResp>))
        );
        const s: Series[] = datas.map((d, i) => ({
          x: d.x, y: d.y, name: `${chs[i].channel_name}${d.unit ? ` [${d.unit}]` : ""}`
        }));
        setSeries(s);
      } finally {
        setLoading(false);
      }
    })();
  }, [group, channels]);

  const fileProps = meta?.file_properties ?? {};
  const groupProps = meta?.group_properties?.[group] ?? {};
  const chanProps = useMemo(() => {
    const map: Record<string, any> = {};
    (meta?.channels ?? []).forEach((c: any) => {
      if (c.group === group) map[c.channel] = c.properties;
    });
    return map;
  }, [meta, group]);

  return (
    <main style={{ maxWidth: 1100, margin:"24px auto", padding:"0 16px" }}>
      <h1 style={{ fontSize:24, fontWeight:600, marginBottom:12 }}>TDMS Metadata + Plot</h1>

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:12 }}>
        <label>Dataset:&nbsp;
          <select value={dsId} onChange={(e)=>setDsId(Number(e.target.value))}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.id} — {d.filename}</option>)}
          </select>
        </label>

        <label>Group:&nbsp;
          <select value={group} onChange={(e)=>setGroup(e.target.value)}>
            {Object.keys(meta?.group_properties ?? {}).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>
        <div>
          {loading && <div>Chargement…</div>}
          {!loading && !series.length && <div>Pas de séries pour ce groupe.</div>}
          {!!series.length && (
            <>
              {/* Deux sous-figures superposées : RPM en haut, Current en bas s'ils existent */}
              <PlotMulti
                title={`${group} — upper trace`}
                series={series.filter(s => /Revolutions/i.test(s.name))}
              />
              <div style={{ height: 12 }} />
              <PlotMulti
                title={`${group} — lower trace`}
                series={series.filter(s => /Current/i.test(s.name))}
              />
            </>
          )}
        </div>

        {/* panneau métadonnées */}
        <aside style={{ border:"1px solid #e3e3e3", borderRadius:8, padding:12 }}>
          <h3 style={{margin:"4px 0 8px"}}>File properties</h3>
          <table style={{ width:"100%", fontSize:14 }}>
            <tbody>
              {Object.entries(fileProps).map(([k,v]) => (
                <tr key={k}><td style={{opacity:.7, padding:"2px 6px"}}>{k}</td><td style={{padding:"2px 6px"}}>{String(v)}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{margin:"16px 0 8px"}}>Group properties — {group}</h3>
          <table style={{ width:"100%", fontSize:14 }}>
            <tbody>
              {Object.entries(groupProps).map(([k,v]) => (
                <tr key={k}><td style={{opacity:.7, padding:"2px 6px"}}>{k}</td><td style={{padding:"2px 6px"}}>{String(v)}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{margin:"16px 0 8px"}}>Channel properties</h3>
          {Object.keys(chanProps).map(ch => (
            <div key={ch} style={{marginBottom:8}}>
              <div style={{fontWeight:600}}>{ch}</div>
              <table style={{ width:"100%", fontSize:14 }}>
                <tbody>
                  {Object.entries(chanProps[ch] ?? {}).map(([k,v]) => (
                    <tr key={k}><td style={{opacity:.7, padding:"2px 6px"}}>{k}</td><td style={{padding:"2px 6px"}}>{String(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
