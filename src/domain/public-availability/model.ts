import { berthFitsVessel, checkAvailability } from "@/domain/availability/matching";
import type {
  AvailabilityBerth,
  AvailabilityBooking,
  AvailabilityRequest,
} from "@/domain/availability/types";
import type { PublicAvailabilityResult } from "@/domain/public-availability/types";

/**
 * Reuses the Milestone 1 physical-berth matcher and deliberately collapses its
 * assignment details into a booking-safe public result.
 */
export function evaluatePublicAvailability(
  request: AvailabilityRequest,
  berths: AvailabilityBerth[],
  bookings: AvailabilityBooking[],
): PublicAvailabilityResult {
  const vesselFitsOperationalBerth = berths.some(
    (berth) =>
      berth.marinaId === request.marinaId && berthFitsVessel(berth, request),
  );

  if (!vesselFitsOperationalBerth) {
    return { available: false, reason: "no_suitable_berth" };
  }

  return checkAvailability(request, berths, bookings).available
    ? { available: true }
    : { available: false, reason: "capacity_full" };
}
