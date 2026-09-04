import { randomBytes } from "node:crypto";

export const ANONYMOUS_BOOKING_COOKIE = "berthio_anonymous_booking";
export const ANONYMOUS_BOOKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createAnonymousBookingToken() {
  return randomBytes(32).toString("base64url");
}
