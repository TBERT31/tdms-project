"use client";
import { useEffect, useMemo, useState } from "react";
import PlotStack2, { Series } from "../components/PlotStack2";
import UploadBox from "../components/UploadBox";
import type { Dataset, Channel, WindowResp } from "../types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function TimetablePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dsId, setDsId] = useState<number | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [group, setGroup] = useState<string | null>(null);

  const [rpm, setRpm] = useState<WindowResp | null>(null);
  const [cur, setCur] = useState<WindowResp | null>(null);

  async function loadDatasets() {
    const r = await fetch(`${API}/datasets`, { cache: "no-store" });
    const j = await r.json();
    setDatasets(j);
    if (!dsId && j?.length) setDsId(j[j.length - 1].id); // prends le dernier upload
  }

  async function loadChannels(datasetId: number) {
    const r = await fetch(`${API}/datasets/${datasetId}/channels`, { cache: "no-store" });
    const j = await r.json() as Channel[];
    setChannels(j);
    if (j.length) setGroup(j[0].group_name);
  }

  async function loadWin(chId: number) {
    const r = await fetch(`${API}/window?channel_id=${chId}&points=2000`, { cache: "no-store" });
    if (!r.ok) throw new Error(await r.text());
    return r.json() as Promise<WindowResp>;
  }

  useEffect(() => { loadDatasets(); }, []);
  useEffect(() => { if (dsId) loadChannels(dsId); }, [dsId]);

  const groups = useMemo(() => [...new Set(channels.map(c => c.group_name))], [channels]);

  useEffect(() => {
    if (!group) return;
    const inGroup = channels.filter(c => c.group_name === group);
    const rpmCh = inGroup.find(c => /Revolutions/i.test(c.channel_name));
    const curCh = inGroup.find(c => /Current/i.test(c.channel_name));
    (async () => {
      if (rpmCh) setRpm(await loadWin(rpmCh.id));
      if (curCh) setCur(await loadWin(curCh.id));
    })();
  }, [group, channels]);

  const rpmSeries: Series | null = rpm ? { x: rpm.x, y: rpm.y, name: "RPM" } : null;
  const curSeries: Series | null = cur ? { x: cur.x, y: cur.y, name: "Current" } : null;

  return (
    <main style={{ maxWidth: 1000, margin: "24px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
        Timetable (2 sous-graphes)
      </h1>

      <UploadBox onDone={loadDatasets} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <label>
          Dataset:&nbsp;
          <select value={dsId ?? ""} onChange={(e) => setDsId(Number(e.target.value))}>
            {datasets.map(d => <option key={d.id} value={d.id}>{d.id} — {d.filename}</option>)}
          </select>
        </label>

        <label>
          Group:&nbsp;
          <select value={group ?? ""} onChange={(e) => setGroup(e.target.value)}>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>

      {rpmSeries && curSeries ? (
        <PlotStack2
          top={rpmSeries}
          bottom={curSeries}
          yTop="Revolutions (1/min)"
          yBottom="Current (A)"
        />
      ) : (
        <div>Choisis un dataset puis un group (Scenario A / Scenario B)…</div>
      )}
    </main>
  );
}
