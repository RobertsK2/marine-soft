import type { Berth } from "@/domain/berths/types";
import type { MapBookingAssignment } from "@/domain/berth-assignments/types";
import type {
  MappedBerth,
  MapDisplayStatus,
  PilotBerthPlacement,
} from "@/domain/marina-map/types";

export function deriveMapDisplayStatus(
  berth: Berth,
  assignments: MapBookingAssignment[] = [],
): MapDisplayStatus {
  if (berth.status !== "available") return "unavailable";
  if (assignments.some((assignment) => assignment.status === "checked_in")) return "occupied";
  if (assignments.some((assignment) => assignment.status === "confirmed")) return "reserved";
  return "available";
}

export function mapBerthsToLayout(
  berths: Berth[],
  placements: readonly PilotBerthPlacement[],
  assignmentsByBerth: ReadonlyMap<string, MapBookingAssignment[]> = new Map(),
): { mappedBerths: MappedBerth[]; unmappedBerths: Berth[] } {
  const berthById = new Map(berths.map((berth) => [berth.id, berth]));
  const mappedBerths = placements.flatMap((placement) => {
    const berth = berthById.get(placement.berthId);
    const assignments = assignmentsByBerth.get(placement.berthId) ?? [];
    return berth
      ? [{ berth, assignments, placement, displayStatus: deriveMapDisplayStatus(berth, assignments) }]
      : [];
  });
  const mappedIds = new Set(mappedBerths.map(({ berth }) => berth.id));

  return {
    mappedBerths,
    unmappedBerths: berths.filter((berth) => !mappedIds.has(berth.id)),
  };
}
