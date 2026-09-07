"use client";

import { useRef, useState } from "react";
import { Minus, Plus, Scan, X } from "lucide-react";
import { BerthDetailsPanel } from "./berth-details-panel";
import { MarinaSvg } from "./marina-svg";
import type { MappedBerth, MapDisplayStatus } from "@/domain/marina-map/types";
import type { BerthStatusActionState } from "@/app/dashboard/berths/actions";
import styles from "./berth-map-workspace.module.css";

const STATUS_LABELS = { available: "Available", reserved: "Reserved", occupied: "Occupied", unavailable: "Unavailable" };

export function BerthMapWorkspace({ mappedBerths, marinaName, unmappedCount, statuses, updateStatusAction }: {
  mappedBerths: MappedBerth[];
  marinaName: string;
  unmappedCount: number;
  statuses: MapDisplayStatus[];
  updateStatusAction?: (berthId: string, state: BerthStatusActionState, formData: FormData) => Promise<BerthStatusActionState>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const selected = mappedBerths.find(({ berth }) => berth.id === selectedId);
  const preview = mappedBerths.find(({ berth }) => berth.id === previewId) ?? selected;
  const closeDetails = () => {
    const previousId = selectedId;
    setSelectedId(null);
    setPreviewId(null);
    if (previousId) root.current?.querySelector<SVGGElement>(`[data-berth-id="${CSS.escape(previousId)}"]`)?.focus();
  };

  return <div className={styles.workspace} ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && selected) { event.preventDefault(); closeDetails(); }
  }}>
    <section aria-label="Berth status summary" className={styles.summary}>
      <article><span>Total berths</span><strong>{statuses.length}</strong></article>
      {(Object.keys(STATUS_LABELS) as MapDisplayStatus[]).map((status) => <article key={status} className={styles[status]}>
        <span><i aria-hidden="true" />{STATUS_LABELS[status]}</span>
        <strong>{statuses.filter((value) => value === status).length}</strong>
      </article>)}
    </section>
    <div className={`${styles.body}${selected ? ` ${styles.selected}` : ""}`}>
      <section className={styles.map} aria-label={`${marinaName} berth workspace`}>
        <header className={styles.mapHeader}><div><h2>Berth overview</h2><p>{mappedBerths.length} mapped / {unmappedCount} awaiting geometry</p></div><span>Select a berth to view details</span></header>
        {mappedBerths.length ? <div className={styles.chart}>
          <div className={styles.canvas} ref={canvas}>
            <div className={styles.drawing} style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
              <MarinaSvg mappedBerths={mappedBerths} selectedBerthId={selectedId} onSelect={setSelectedId} onPreview={setPreviewId} />
            </div>
          </div>
          <div className={styles.controls} aria-label="Map zoom controls">
            <button type="button" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + .25))}><Plus size={19} /></button>
            <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - .25))}><Minus size={19} /></button>
            <button type="button" aria-label="Reset map view" onClick={() => { setZoom(1); canvas.current?.scrollTo({ top: 0, left: 0 }); }}><Scan size={19} /></button>
            <output aria-label="Map zoom">{Math.round(zoom * 100)}%</output>
          </div>
          {preview ? <div className={styles.preview} role="status" aria-label="Berth preview">
            <strong>Berth {preview.berth.code}</strong><span>{STATUS_LABELS[preview.displayStatus]} · {preview.berth.zone}</span>
            <small>Max {preview.berth.max_length_m} m length / {preview.berth.max_beam_m} m beam</small>
          </div> : null}
          <div className={styles.legend} aria-label="Map status legend">{Object.entries(STATUS_LABELS).map(([status, label]) => <span className={styles[status]} key={status}><i aria-hidden="true" />{label}</span>)}</div>
        </div> : <div className={styles.empty}><h2>No configured map geometry</h2><p>This marina&apos;s berth records are intact, but no map geometry is configured.</p></div>}
      </section>
      {selected ? <div className={styles.details}>
        <button className={styles.close} type="button" onClick={closeDetails} aria-label="Close berth details"><X size={18} /></button>
        <BerthDetailsPanel key={selected.berth.id} mappedBerth={selected} updateStatusAction={updateStatusAction} />
      </div> : null}
    </div>
  </div>;
}
