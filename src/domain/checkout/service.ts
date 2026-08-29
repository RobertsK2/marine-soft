import "server-only";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { getSiteUrl, isStripeLocalPlatformFallbackEnabled } from "@/lib/env";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { getStripe } from "@/lib/stripe/server";
import { buildCheckoutSessionParams, LOCAL_PLATFORM_ACCOUNT_MARKER } from "@/domain/checkout/model";
import { issueGuestManagementUrl } from "@/domain/guest-access/service";

export class CheckoutServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "CheckoutServiceError"; }
}

export async function createCheckoutForHold(holdToken: string, stripe: Stripe = getStripe()) {
  const supabase = createPrivilegedClient();
  const { data, error } = await supabase.rpc("prepare_booking_checkout", { target_hold_token: holdToken });
  if (error) throw new CheckoutServiceError("Unable to prepare checkout.", { cause: error });
  const prepared = data?.[0];
  if (!prepared || prepared.outcome !== "ready" || !prepared.payment_id || !prepared.stripe_account_id ||
      !prepared.amount_total_minor || !prepared.currency || !prepared.marina_slug || !prepared.marina_name) {
    return { outcome: prepared?.outcome ?? "not_found", url: null };
  }
  const useLocalPlatform = isStripeLocalPlatformFallbackEnabled()
    && prepared.stripe_account_id === LOCAL_PLATFORM_ACCOUNT_MARKER;
  const requestOptions: Stripe.RequestOptions = {
    idempotencyKey: `berthio-checkout-${prepared.payment_id}`,
    ...(!useLocalPlatform ? { stripeAccount: prepared.stripe_account_id } : {}),
  };
  try {
    if (prepared.existing_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(prepared.existing_checkout_session_id, {}, requestOptions);
      return { outcome: "ready", url: existing.url };
    }
    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create(buildCheckoutSessionParams({
      holdToken, paymentId: prepared.payment_id, marinaName: prepared.marina_name,
      marinaSlug: prepared.marina_slug, amountTotalMinor: prepared.amount_total_minor,
      currency: prepared.currency, siteUrl,
      integrationIdentifier: `berthio_phase6_${randomLetters(8)}`,
      localPlatformAccountMarker: useLocalPlatform ? LOCAL_PLATFORM_ACCOUNT_MARKER : undefined,
    }), requestOptions);
    if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");
    const { data: attached, error: attachError } = await supabase.rpc("attach_booking_checkout_session", {
      target_payment_id: prepared.payment_id,
      target_session_id: session.id,
    });
    if (attachError || !attached) {
      await stripe.checkout.sessions.expire(session.id, {}, requestOptions).catch(() => undefined);
      throw attachError ?? new Error("Checkout Session could not be attached.");
    }
    return { outcome: "ready", url: session.url };
  } catch (checkoutError) {
    await supabase.rpc("fail_booking_checkout_creation", { target_payment_id: prepared.payment_id });
    throw new CheckoutServiceError("Unable to create Stripe Checkout.", { cause: checkoutError });
  }
}

function randomLetters(length: number) {
  return [...randomBytes(length)].map((value) => String.fromCharCode(97 + (value % 26))).join("");
}

export async function getCheckoutReturnStatus(marinaSlug: string, sessionId: string) {
  const supabase = createPrivilegedClient();
  const { data: marina, error: marinaError } = await supabase.from("marinas").select("id, name").eq("slug", marinaSlug).eq("is_public", true).maybeSingle();
  if (marinaError || !marina) return null;
  const { data, error } = await supabase.from("booking_payments")
    .select("id, status, amount_total_minor, currency, paid_at")
    .eq("marina_id", marina.id).eq("stripe_checkout_session_id", sessionId).maybeSingle();
  if (error || !data) return null;
  const { data: booking, error: bookingError } = await supabase.from("bookings")
    .select("id, reference, arrival_date, departure_date, eta, etd, vessel_name, vessel_length_m, vessel_beam_m, vessel_draft_m, status")
    .eq("marina_id", marina.id).eq("booking_payment_id", data.id).maybeSingle();
  if (bookingError) throw new CheckoutServiceError("Unable to load booking confirmation.", { cause: bookingError });
  const guestManagementUrl = booking
    ? await issueGuestManagementUrl(booking.id).catch(() => null)
    : null;
  const confirmation = booking ? {
    reference: booking.reference,
    marinaName: marina.name,
    arrivalDate: booking.arrival_date,
    departureDate: booking.departure_date,
    eta: booking.eta,
    etd: booking.etd,
    vesselName: booking.vessel_name,
    vesselLengthM: booking.vessel_length_m,
    vesselBeamM: booking.vessel_beam_m,
    vesselDraftM: booking.vessel_draft_m,
    status: booking.status,
  } : null;
  return {
    status: data.status === "paid" && confirmation ? "paid" as const : data.status === "pending" || data.status === "paid" ? "processing" as const : "failed" as const,
    amountTotalMinor: data.amount_total_minor,
    currency: data.currency,
    paidAt: data.paid_at,
    confirmation,
    guestManagementUrl,
  };
}
