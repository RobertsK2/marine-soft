import "server-only";
import type { PublicBookingSearch } from "@/domain/public-booking/types";
import { calculatePriceSnapshot } from "@/domain/pricing/model";
import { loadPricingCatalog } from "@/domain/pricing/repository";
import type { BookingHoldResult } from "@/domain/booking-holds/types";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import type { Json } from "@/types/database";
import type { BookingHoldRequester } from "@/domain/booking-holds/requester";

export class BookingHoldServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BookingHoldServiceError";
  }
}

async function preparePublicBookingHold(
  marinaSlug: string,
  idempotencyKey: string,
  request: PublicBookingSearch,
  requester: BookingHoldRequester,
) {
  const supabase = createPrivilegedClient();
  const { data: marina, error: marinaError } = await supabase
    .from("marinas")
    .select("id")
    .eq("slug", marinaSlug)
    .eq("is_public", true)
    .maybeSingle();
  if (marinaError) throw new BookingHoldServiceError("Unable to resolve the marina.", { cause: marinaError });
  if (!marina) return null;

  try {
    const catalog = await loadPricingCatalog(supabase, marina.id);
    if (!catalog) throw new BookingHoldServiceError("Pricing is not configured.");
    const snapshot = calculatePriceSnapshot(request, catalog);
    return {
      target_marina_id: marina.id,
      request_idempotency_key: idempotencyKey,
      requested_arrival: request.arrivalDate,
      requested_departure: request.departureDate,
      requested_eta: request.eta,
      requested_etd: request.etd,
      requested_vessel_name: request.vesselName,
      requested_length_m: request.vesselLengthM,
      requested_beam_m: request.vesselBeamM,
      requested_draft_m: request.vesselDraftM,
      calculated_price_currency: snapshot.currency,
      calculated_price_total_minor: snapshot.totalMinor,
      calculated_price_snapshot: snapshot as unknown as Json,
      request_session_hash: requester.sessionHash,
      request_network_hash: requester.networkHash,
    };
  } catch (error) {
    if (error instanceof BookingHoldServiceError) throw error;
    throw new BookingHoldServiceError("Unable to prepare the protected booking request.", { cause: error });
  }
}

export async function createPublicBookingHold(
  marinaSlug: string, idempotencyKey: string, request: PublicBookingSearch, requester: BookingHoldRequester,
): Promise<BookingHoldResult> {
  const args = await preparePublicBookingHold(marinaSlug, idempotencyKey, request, requester);
  if (!args) return { outcome: "not_found", holdToken: null, expiresAt: null, totalMinor: null, currency: null };
  const { data, error } = await createPrivilegedClient().rpc("create_booking_hold", args);
  const row = data?.[0];
  if (error || !row) throw new BookingHoldServiceError("Unable to create the booking hold.", { cause: error });
  return { outcome: row.outcome as BookingHoldResult["outcome"], holdToken: row.hold_token,
    expiresAt: row.hold_expires_at, totalMinor: row.total_minor, currency: row.currency };
}

export async function confirmPublicPayAtMarinaBooking(
  marinaSlug: string, idempotencyKey: string, request: PublicBookingSearch, requester: BookingHoldRequester,
  customer: { customerName: string; customerEmail: string; customerPhone: string },
) {
  const args = await preparePublicBookingHold(marinaSlug, idempotencyKey, request, requester);
  if (!args) return { outcome: "not_found", bookingId: null };
  const { data, error } = await createPrivilegedClient().rpc("confirm_pay_at_marina_booking", {
    ...args, requested_customer_name: customer.customerName,
    requested_customer_email: customer.customerEmail, requested_customer_phone: customer.customerPhone,
  });
  const row = data?.[0];
  if (error || !row) throw new BookingHoldServiceError("Unable to confirm the booking.", { cause: error });
  return { outcome: row.outcome, bookingId: row.booking_id };
}

export async function releasePublicBookingHoldAfterCheckoutFailure(holdToken: string) {
  const { data, error } = await createPrivilegedClient().rpc(
    "release_booking_hold_after_checkout_failure",
    { target_hold_token: holdToken },
  );
  if (error) throw new BookingHoldServiceError("Unable to release the booking hold.", { cause: error });
  return data;
}
