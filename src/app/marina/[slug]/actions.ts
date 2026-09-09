"use server";

import { redirect } from "next/navigation";
import { createPublicBookingHold, confirmPublicPayAtMarinaBooking } from "@/domain/booking-holds/service";
import { validateBookingInput } from "@/domain/bookings/validation";
import { issueGuestManagementUrl } from "@/domain/guest-access/service";
import { getBookingHoldRequester } from "@/domain/booking-holds/requester";
import { createCheckoutForHold } from "@/domain/checkout/service";
import type { CheckoutActionState } from "@/domain/checkout/types";
import { validatePublicBookingSearch } from "@/domain/public-booking/validation";
import { captureServerError } from "@/lib/monitoring/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function startBookingCheckoutAction(
  marinaSlug: string,
  _state: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const idempotencyKey = String(formData.get("holdIdempotencyKey") ?? "");
  if (!UUID.test(idempotencyKey)) return { status: "error", message: "Check availability again to continue.", requiresAvailabilityCheck: true };

  let holdToken: string;
  let confirmationUrl: string | null = null;
  try {
    const supabase = createPrivilegedClient();
    const { data: marina, error } = await supabase.from("marinas").select("timezone, accepts_online_payment, accepts_pay_at_marina")
      .eq("slug", marinaSlug).eq("is_public", true).maybeSingle();
    if (error || !marina) return { status: "error", message: "This marina is unavailable.", requiresAvailabilityCheck: true };
    const validation = validatePublicBookingSearch(Object.fromEntries(formData), marina.timezone);
    if (!validation.success) return { status: "error", message: validation.formError ?? "Review the stay details and check availability again.", requiresAvailabilityCheck: true };

    const method = formData.get("paymentMethod") ?? "online";
    if ((method !== "online" && method !== "marina") || (method === "online" && !marina.accepts_online_payment)
      || (method === "marina" && !marina.accepts_pay_at_marina)) {
      return { status: "error", message: "This payment method is no longer available. Please check availability again.", requiresAvailabilityCheck: true };
    }

    // The existing RPC checks requester ownership, matching details, quotas,
    // expiry and capacity under its marina lock before creating or reusing a hold.
    const requester = await getBookingHoldRequester();
    if (method === "marina") {
      const customer = validateBookingInput(Object.fromEntries(formData));
      if (!customer.success) return { status: "error", message: "Enter your contact details to confirm the booking.", fieldErrors: customer.errors };
      const result = await confirmPublicPayAtMarinaBooking(marinaSlug, idempotencyKey, validation.data, requester, {
        customerName: customer.data.customerName,
        customerEmail: customer.data.customerEmail,
        customerPhone: customer.data.customerPhone,
      });
      if ((result.outcome === "confirmed" || result.outcome === "existing") && result.bookingId) {
        confirmationUrl = await issueGuestManagementUrl(result.bookingId);
        if (!confirmationUrl) return { status: "error", message: "Your booking was created, but confirmation could not be opened. Retry to open the same booking." };
      } else {
        return { status: "error", message: result.outcome === "unavailable"
          ? "Availability has changed. Please check availability again."
          : result.outcome === "rate_limited" ? "Too many booking attempts. Please try again later."
          : "This booking attempt cannot be completed. Please check availability again.", requiresAvailabilityCheck: result.outcome !== "rate_limited" };
      }
      holdToken = "";
    } else {
    const result = await createPublicBookingHold(marinaSlug, idempotencyKey, validation.data, requester);
    if ((result.outcome === "created" || result.outcome === "existing") && result.holdToken && result.expiresAt) {
      holdToken = result.holdToken;
    } else {
      if (result.outcome === "unavailable") return { status: "error", message: "Availability has changed. Please check availability again.", requiresAvailabilityCheck: true };
      if (result.outcome === "rate_limited") return { status: "error", message: "Too many booking attempts. Please try again later." };
      if (result.outcome === "idempotency_conflict") return { status: "error", message: "The stay details changed. Please check availability again.", requiresAvailabilityCheck: true };
      if (result.outcome === "closed") return { status: "error", message: "This booking attempt has ended. Please check availability again.", requiresAvailabilityCheck: true };
      return { status: "error", message: "This marina is unavailable.", requiresAvailabilityCheck: true };
    }
    }
  } catch (holdError) {
    captureServerError(holdError, { operation: "public_booking_hold", marinaSlug });
    return { status: "error", message: "Your booking could not be started. Please try again." };
  }

  if (confirmationUrl) redirect(`${confirmationUrl}?confirmation=1`);

  let checkoutUrl: string;
  try {
    const result = await createCheckoutForHold(holdToken);
    if (result.outcome !== "ready" || !result.url) {
      return { status: "error", message: result.outcome === "expired" || result.outcome === "closed"
        ? "This booking attempt has ended. Please check availability again."
        : "Payment is currently unavailable. Please check availability again later.", requiresAvailabilityCheck: true };
    }
    const url = new URL(result.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Unexpected Stripe Checkout URL.");
    checkoutUrl = url.toString();
  } catch (checkoutError) {
    // Checkout handles definite rejection with the existing release RPC. An
    // uncertain result retains the original expiry so a safe retry can reuse it.
    captureServerError(checkoutError, { operation: "stripe_checkout_create", marinaSlug });
    return { status: "error", message: "Secure payment could not be opened. Please try again, or check availability again." };
  }
  redirect(checkoutUrl);
}
