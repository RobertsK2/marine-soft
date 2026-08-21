import type { Berth } from "@/domain/berths/types";
import type {
  MappedBerth,
  MapDisplayStatus,
  PilotBerthPlacement,
} from "@/domain/marina-map/types";

export function deriveMapDisplayStatus(berth: Berth): MapDisplayStatus {
  return berth.status === "available" ? "available" : "unavailable";
}

export function mapBerthsToLayout(
  berths: Berth[],
  placements: readonly PilotBerthPlacement[],
): { mappedBerths: MappedBerth[]; unmappedBerths: Berth[] } {
  const berthById = new Map(berths.map((berth) => [berth.id, berth]));
  const mappedBerths = placements.flatMap((placement) => {
    const berth = berthById.get(placement.berthId);
    return berth
      ? [{ berth, placement, displayStatus: deriveMapDisplayStatus(berth) }]
      : [];
  });
  const mappedIds = new Set(mappedBerths.map(({ berth }) => berth.id));

  return {
    mappedBerths,
    unmappedBerths: berths.filter((berth) => !mappedIds.has(berth.id)),
  };
}
