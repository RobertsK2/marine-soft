import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getGuestAccessSigningSecret, getSiteUrl } from "@/lib/env";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import type { GuestBooking } from "@/domain/guest-access/types";

const TOKEN_VERSION = "v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TokenPayload = { g: string; e: number };

function signature(payload: string) {
  return createHmac("sha256", getGuestAccessSigningSecret()).update(`${TOKEN_VERSION}.${payload}`).digest("base64url");
}

export function createGuestAccessToken(grantId: string, expiresAt: string) {
  const payload = Buffer.from(JSON.stringify({
    g: grantId,
    e: Math.floor(new Date(expiresAt).getTime() / 1000),
  } satisfies TokenPayload)).toString("base64url");
  return `${TOKEN_VERSION}.${payload}.${signature(payload)}`;
}

export function verifyGuestAccessToken(token: string, now = Date.now()): TokenPayload | null {
  if (token.length > 256) return null;
  const [version, payload, suppliedSignature, extra] = token.split(".");
  if (version !== TOKEN_VERSION || !payload || !suppliedSignature || extra) return null;
  const expected = Buffer.from(signature(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (!UUID.test(parsed.g ?? "") || !Number.isSafeInteger(parsed.e) || (parsed.e ?? 0) <= Math.floor(now / 1000)) return null;
    return { g: parsed.g!, e: parsed.e! };
  } catch {
    return null;
  }
}

export async function issueGuestManagementUrl(bookingId: string) {
  const { data, error } = await createPrivilegedClient().rpc("ensure_guest_booking_access", {
    target_booking_id: bookingId,
  });
  const grant = data?.[0];
  if (error || !grant) return null;
  const token = createGuestAccessToken(grant.grant_id, grant.expires_at);
  return `${getSiteUrl()}/guest/bookings/${encodeURIComponent(token)}`;
}

export async function loadGuestBooking(token: string): Promise<GuestBooking | null> {
  const payload = verifyGuestAccessToken(token);
  if (!payload) return null;
  const { data, error } = await createPrivilegedClient().rpc("get_guest_booking", {
    target_grant_id: payload.g,
  });
  const booking = data?.[0];
  if (error || !booking) return null;
  return {
    reference: booking.booking_reference,
    marinaName: booking.marina_name,
    arrivalDate: booking.arrival_date,
    departureDate: booking.departure_date,
    eta: booking.eta,
    etd: booking.etd,
    vesselName: booking.vessel_name,
    vesselLengthM: booking.vessel_length_m,
    vesselBeamM: booking.vessel_beam_m,
    vesselDraftM: booking.vessel_draft_m,
    priceTotalMinor: booking.price_total_minor,
    priceCurrency: booking.price_currency,
    status: booking.booking_status,
    accessExpiresAt: booking.access_expires_at,
  };
}

export async function updateGuestBookingTimes(token: string, eta: string, etd: string) {
  const payload = verifyGuestAccessToken(token);
  if (!payload) return false;
  const { data, error } = await createPrivilegedClient().rpc("update_guest_booking_times", {
    target_grant_id: payload.g,
    requested_eta: eta,
    requested_etd: etd,
  });
  return !error && data === true;
}
