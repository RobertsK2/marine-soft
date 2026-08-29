import type { MapDisplayStatus } from "@/domain/marina-map/types";

const ITEMS: { label: string; status: MapDisplayStatus; note: string }[] = [
  { label: "Available", status: "available", note: "Operational" },
  { label: "Reserved", status: "reserved", note: "Real assignment" },
  { label: "Occupied", status: "occupied", note: "Assigned + checked in" },
  { label: "Unavailable", status: "unavailable", note: "Blocked or out of service" },
];

export function MapLegend() {
  return (
    <ul className="map-legend" aria-label="Map status legend">
      {ITEMS.map((item) => (
        <li key={item.status}>
          <span className={`map-legend-swatch map-legend-${item.status}`} aria-hidden="true" />
          <strong>{item.label}</strong>
          <span>{item.note}</span>
        </li>
      ))}
    </ul>
  );
}
