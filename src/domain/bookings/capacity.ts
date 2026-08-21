import type { BookingCapacityRequest } from "@/domain/bookings/types";

export type BookingCapacityLookup = (
  request: BookingCapacityRequest,
) => Promise<boolean>;

export async function validateBookingCapacity(
  request: BookingCapacityRequest,
  lookup: BookingCapacityLookup,
) {
  return lookup(request);
}
