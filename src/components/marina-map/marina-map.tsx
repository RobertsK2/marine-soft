"use client";

import { useState } from "react";
import { BerthDetailsPanel } from "@/components/marina-map/berth-details-panel";
import { MapLegend } from "@/components/marina-map/map-legend";
import { MarinaSvg } from "@/components/marina-map/marina-svg";
import type { MappedBerth } from "@/domain/marina-map/types";
import type { BerthStatusActionState } from "@/app/dashboard/berths/actions";

type StatusAction = (
  berthId: string,
  state: BerthStatusActionState,
  formData: FormData,
) => Promise<BerthStatusActionState>;

export function MarinaMap({
  compact = false,
  mappedBerths,
  marinaName,
  unmappedCount,
  updateStatusAction,
}: {
  compact?: boolean;
  mappedBerths: MappedBerth[];
  marinaName: string;
  unmappedCount: number;
  updateStatusAction?: StatusAction;
}) {
  const [selectedBerthId, setSelectedBerthId] = useState<string | null>(null);
  const selectedBerth =
    mappedBerths.find(({ berth }) => berth.id === selectedBerthId) ?? null;

  return (
    <section className={`marina-map-card${compact ? " marina-map-card-compact" : ""}`} aria-labelledby="marina-map-heading">
      <header className="marina-map-toolbar">
        <div>
          <span>Phase 6 / Live physical inventory</span>
          <h2 id="marina-map-heading">Berth overview</h2>
        </div>
        <label className="map-view-select">
          <span>View</span>
          <select aria-label="Marina map view" disabled value={marinaName}>
            <option>{marinaName}</option>
          </select>
        </label>
      </header>
      <div className="marina-map-meta">
        <MapLegend />
        <p>{mappedBerths.length} mapped / {unmappedCount} awaiting geometry</p>
      </div>
      {mappedBerths.length ? (
        <div className="marina-map-workspace">
          <div className="marina-map-canvas">
            <MarinaSvg
              mappedBerths={mappedBerths}
              onSelect={setSelectedBerthId}
              selectedBerthId={selectedBerthId}
            />
          </div>
          <BerthDetailsPanel
            mappedBerth={selectedBerth}
            updateStatusAction={updateStatusAction}
          />
        </div>
      ) : (
        <div className="inventory-empty">
          <h2>No configured map geometry</h2>
          <p>This marina&apos;s berth records are intact, but Berthio has not configured its pilot SVG.</p>
        </div>
      )}
    </section>
  );
}
