import type {
  AvailabilityAssignment,
  AvailabilityBerth,
  AvailabilityBooking,
  AvailabilityRequest,
  AvailabilityResult,
} from "@/domain/availability/types";

export const REQUESTED_BOOKING_ID = "requested-booking";
export const MAX_ALLOCATION_DEMANDS = 64;
export const MAX_ALLOCATION_BERTHS = 256;
export const MAX_ALLOCATION_INPUT_ROWS = 4_096;
export const MAX_ALLOCATION_SEARCH_NODES = 50_000;

export class AllocationWorkBudgetExceededError extends Error {
  constructor() {
    super("Berth allocation search exceeded its safe work budget.");
    this.name = "AllocationWorkBudgetExceededError";
  }
}

type Demand = {
  id: string;
  arrivalDate: string;
  departureDate: string;
  vesselLengthM: number;
  vesselBeamM: number;
  vesselDraftM: number;
};

type DemandWithCandidates = Demand & { candidates: AvailabilityBerth[] };

export function intervalsOverlap(
  left: Pick<Demand, "arrivalDate" | "departureDate">,
  right: Pick<Demand, "arrivalDate" | "departureDate">,
) {
  return left.arrivalDate < right.departureDate && right.arrivalDate < left.departureDate;
}

function effectivelyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.005;
}

export function berthFitsVessel(
  berth: AvailabilityBerth,
  vessel: Pick<Demand, "vesselLengthM" | "vesselBeamM" | "vesselDraftM">,
) {
  if (berth.status !== "available") return false;
  if (
    vessel.vesselLengthM > berth.maxLengthM ||
    vessel.vesselBeamM > berth.maxBeamM ||
    vessel.vesselDraftM > berth.maxDraftM
  ) {
    return false;
  }

  const isExactFit =
    effectivelyEqual(vessel.vesselLengthM, berth.maxLengthM) &&
    effectivelyEqual(vessel.vesselBeamM, berth.maxBeamM) &&
    effectivelyEqual(vessel.vesselDraftM, berth.maxDraftM);
  return berth.allowSmallerVessels || isExactFit;
}

function compareBerths(left: AvailabilityBerth, right: AvailabilityBerth) {
  return (
    left.maxLengthM - right.maxLengthM ||
    left.maxBeamM - right.maxBeamM ||
    left.maxDraftM - right.maxDraftM ||
    left.priority - right.priority ||
    left.code.localeCompare(right.code) ||
    left.id.localeCompare(right.id)
  );
}

function compareDemands(left: DemandWithCandidates, right: DemandWithCandidates) {
  return (
    left.candidates.length - right.candidates.length ||
    right.vesselLengthM - left.vesselLengthM ||
    right.vesselBeamM - left.vesselBeamM ||
    right.vesselDraftM - left.vesselDraftM ||
    left.arrivalDate.localeCompare(right.arrivalDate) ||
    left.departureDate.localeCompare(right.departureDate) ||
    left.id.localeCompare(right.id)
  );
}

function activeBooking(booking: AvailabilityBooking) {
  return booking.status === "confirmed" || booking.status === "checked_in";
}

function connectedBookings(
  request: Demand,
  bookings: AvailabilityBooking[],
) {
  const ordered = [request, ...bookings].sort((left, right) =>
    left.arrivalDate.localeCompare(right.arrivalDate) ||
    left.departureDate.localeCompare(right.departureDate) ||
    left.id.localeCompare(right.id));
  let group: Array<Demand | AvailabilityBooking> = [];
  let groupDeparture = "";

  for (const interval of ordered) {
    if (group.length > 0 && interval.arrivalDate >= groupDeparture) {
      if (group.some((candidate) => candidate.id === request.id)) {
        return group.filter((candidate): candidate is AvailabilityBooking => candidate.id !== request.id);
      }
      group = [];
    }
    group.push(interval);
    if (interval.departureDate > groupDeparture) groupDeparture = interval.departureDate;
  }
  if (group.some((candidate) => candidate.id === request.id)) {
    return group.filter((candidate): candidate is AvailabilityBooking => candidate.id !== request.id);
  }
  return [];
}

export function checkAvailability(
  request: AvailabilityRequest,
  berths: AvailabilityBerth[],
  existingBookings: AvailabilityBooking[],
): AvailabilityResult {
  if (berths.length > MAX_ALLOCATION_INPUT_ROWS || existingBookings.length > MAX_ALLOCATION_INPUT_ROWS) {
    throw new AllocationWorkBudgetExceededError();
  }
  const marinaBerths = berths
    .filter((berth) => berth.marinaId === request.marinaId && berth.status === "available")
    .sort(compareBerths);

  if (marinaBerths.length > MAX_ALLOCATION_BERTHS) {
    throw new AllocationWorkBudgetExceededError();
  }

  const requestDemand: Demand = {
    id: REQUESTED_BOOKING_ID,
    arrivalDate: request.arrivalDate,
    departureDate: request.departureDate,
    vesselLengthM: request.vesselLengthM,
    vesselBeamM: request.vesselBeamM,
    vesselDraftM: request.vesselDraftM,
  };

  const demands: Demand[] = [
    requestDemand,
    ...connectedBookings(
      requestDemand,
      existingBookings.filter(
        (booking) => booking.marinaId === request.marinaId && activeBooking(booking),
      ),
    )
      .map((booking) => ({
        id: booking.id,
        arrivalDate: booking.arrivalDate,
        departureDate: booking.departureDate,
        vesselLengthM: booking.vesselLengthM,
        vesselBeamM: booking.vesselBeamM,
        vesselDraftM: booking.vesselDraftM,
      })),
  ];

  if (demands.length > MAX_ALLOCATION_DEMANDS) {
    throw new AllocationWorkBudgetExceededError();
  }

  const withCandidates: DemandWithCandidates[] = demands
    .map((demand) => ({
      ...demand,
      candidates: marinaBerths.filter((berth) => berthFitsVessel(berth, demand)),
    }))
    .sort(compareDemands);

  if (withCandidates.some((demand) => demand.candidates.length === 0)) {
    return { available: false, assignments: [], requestedBerthId: null };
  }

  const assignedToBerth = new Map<string, Demand[]>();
  const assignments = new Map<string, string>();
  let visitedNodes = 0;

  function assign(index: number): boolean {
    visitedNodes += 1;
    if (visitedNodes > MAX_ALLOCATION_SEARCH_NODES) {
      throw new AllocationWorkBudgetExceededError();
    }
    if (index === withCandidates.length) return true;
    const demand = withCandidates[index];

    for (const berth of demand.candidates) {
      const occupants = assignedToBerth.get(berth.id) ?? [];
      if (occupants.some((occupant) => intervalsOverlap(occupant, demand))) continue;

      occupants.push(demand);
      assignedToBerth.set(berth.id, occupants);
      assignments.set(demand.id, berth.id);

      if (assign(index + 1)) return true;

      assignments.delete(demand.id);
      occupants.pop();
      if (occupants.length === 0) assignedToBerth.delete(berth.id);
    }
    return false;
  }

  if (!assign(0)) {
    return { available: false, assignments: [], requestedBerthId: null };
  }

  const resultAssignments: AvailabilityAssignment[] = [...assignments]
    .map(([bookingId, berthId]) => ({ bookingId, berthId }))
    .sort((left, right) => left.bookingId.localeCompare(right.bookingId));

  return {
    available: true,
    assignments: resultAssignments,
    requestedBerthId: assignments.get(REQUESTED_BOOKING_ID) ?? null,
  };
}
