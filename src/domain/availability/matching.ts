import type {
  AvailabilityAssignment,
  AvailabilityBerth,
  AvailabilityBooking,
  AvailabilityRequest,
  AvailabilityResult,
} from "@/domain/availability/types";

export const REQUESTED_BOOKING_ID = "requested-booking";

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
  const connected: AvailabilityBooking[] = [];
  const intervals: Array<Pick<Demand, "arrivalDate" | "departureDate">> = [request];
  const remaining = [...bookings];

  let added = true;
  while (added) {
    added = false;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const booking = remaining[index];
      if (!intervals.some((interval) => intervalsOverlap(interval, booking))) continue;
      connected.push(booking);
      intervals.push(booking);
      remaining.splice(index, 1);
      added = true;
    }
  }
  return connected;
}

export function checkAvailability(
  request: AvailabilityRequest,
  berths: AvailabilityBerth[],
  existingBookings: AvailabilityBooking[],
): AvailabilityResult {
  const marinaBerths = berths
    .filter((berth) => berth.marinaId === request.marinaId && berth.status === "available")
    .sort(compareBerths);

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

  function assign(index: number): boolean {
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
