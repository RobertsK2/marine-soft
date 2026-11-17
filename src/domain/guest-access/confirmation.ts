import "server-only";
import { loadGuestBooking, verifyGuestAccessToken } from "./service";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { getPublicMarinaBySlug } from "@/domain/public-marinas/repository";
import type { BookingConfirmationData } from "@/domain/checkout/confirmation";

// The signed token and existing RPC authorize the safe booking projection first.
// Resolve additional display data only through that same active grant; never
// accept a booking ID, reference, marina, or payment method from the request.
export async function loadGuestBookingConfirmation(token: string) {
  const booking = await loadGuestBooking(token);
  const payload = verifyGuestAccessToken(token);
  if (!booking || !payload) return null;
  const supabase = createPrivilegedClient();
  const { data: grant, error: grantError } = await supabase.from("guest_booking_access_grants")
    .select("booking_id").eq("id", payload.g).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (grantError || !grant) return null;
  const { data: record, error: recordError } = await supabase.from("bookings")
    .select("marina_id, booking_payment_id, price_snapshot").eq("id", grant.booking_id).maybeSingle();
  if (recordError || !record) return null;
  const [profile, balance] = await Promise.all([
    supabase.from("marinas").select("slug").eq("id", record.marina_id).maybeSingle(),
    supabase.from("booking_payment_balances").select("total_due_minor, paid_minor, balance_due_minor, currency")
      .eq("marina_id", record.marina_id).eq("booking_id", grant.booking_id).maybeSingle(),
  ]);
  if (profile.error || !profile.data || balance.error) return null;
  const marina = await getPublicMarinaBySlug(supabase, profile.data.slug);
  if (!marina) return null;
  const total = balance.data?.total_due_minor ?? booking.priceTotalMinor;
  const due = balance.data?.balance_due_minor ?? booking.balanceDueMinor;
  const payment: BookingConfirmationData = {
    status: booking.status === "cancelled" ? "unavailable" : "confirmed",
    paymentMethod: record.booking_payment_id ? "online" : "marina",
    amountTotalMinor: total,
    paidMinor: balance.data?.paid_minor ?? Math.max(0, total - due),
    balanceDueMinor: due,
    currency: balance.data?.currency ?? booking.priceCurrency,
    paidAt: null,
    confirmation: booking,
    guestManagementUrl: null,
    priceSnapshot: record.price_snapshot,
    berthAssignment: "unknown",
    emailSent: false,
  };
  return { booking, marina, payment };
}
