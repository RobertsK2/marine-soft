import { BerthShape } from "@/components/marina-map/berth-shape";
import type { MappedBerth } from "@/domain/marina-map/types";

export function MarinaSvg({
  mappedBerths,
  selectedBerthId,
  onSelect,
}: {
  mappedBerths: MappedBerth[];
  selectedBerthId: string | null;
  onSelect: (berthId: string) => void;
}) {
  return (
    <svg
      aria-label="Interactive pilot marina berth map"
      className="marina-svg"
      role="img"
      viewBox="0 0 1000 680"
    >
      <title>Pilot marina physical berth map</title>
      <desc>Choose a berth to inspect dimensions, operational status, and real booking assignments.</desc>
      <rect className="map-water" height="680" width="1000" />
      <g aria-hidden="true" className="map-compass" transform="translate(80 82)">
        <circle r="28" />
        <path d="M 0 -18 L 6 6 L 0 2 L -6 6 Z" />
        <text textAnchor="middle" y="-36">N</text>
      </g>
      <g aria-hidden="true" className="map-docks">
        <path d="M 155 185 H 665" />
        <path d="M 155 185 V 575 H 410" />
        <path d="M 410 575 L 700 285" />
        <path className="map-dock-edge" d="M 171 201 H 650 M 171 201 V 559 H 403 L 689 273" />
      </g>
      <g className="map-zone-labels" aria-hidden="true">
        <text x="350" y="235">NORTH PIER</text>
        <text x="205" y="535">SOUTH PIER</text>
        <text x="680" y="565">DEEP WATER</text>
      </g>
      {mappedBerths.map((mappedBerth) => (
        <BerthShape
          key={mappedBerth.berth.id}
          mappedBerth={mappedBerth}
          onSelect={onSelect}
          selected={mappedBerth.berth.id === selectedBerthId}
        />
      ))}
    </svg>
  );
}
