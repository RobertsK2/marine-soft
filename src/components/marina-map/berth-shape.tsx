import type { KeyboardEvent } from "react";
import type { MappedBerth } from "@/domain/marina-map/types";

function statusLabel(status: MappedBerth["berth"]["status"]) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function BerthShape({
  mappedBerth,
  selected,
  onSelect,
}: {
  mappedBerth: MappedBerth;
  selected: boolean;
  onSelect: (berthId: string) => void;
}) {
  const { berth, displayStatus, placement } = mappedBerth;
  const label = `Berth ${berth.code}, ${statusLabel(berth.status)}`;
  const select = () => onSelect(berth.id);
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };

  return (
    <g
      aria-label={label}
      aria-pressed={selected}
      className={`map-berth map-berth-${displayStatus}${selected ? " map-berth-selected" : ""}`}
      data-berth-id={berth.id}
      onClick={select}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      transform={`translate(${placement.x} ${placement.y}) rotate(${placement.rotation})`}
    >
      <title>{label}</title>
      <path className="map-berth-mooring" d="M 0 42 V 67" />
      <path className="map-berth-hull" d="M -27 -40 Q 0 -55 27 -40 L 22 34 Q 0 49 -22 34 Z" />
      <path className="map-berth-deck" d="M -17 -26 H 17 M -19 19 H 19" />
      <text className="map-berth-code" textAnchor="middle" y="2">{berth.code}</text>
      <text className="map-berth-state" textAnchor="middle" y="17">
        {displayStatus === "available" ? "OPEN" : "HOLD"}
      </text>
    </g>
  );
}
