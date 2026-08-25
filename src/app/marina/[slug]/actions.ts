"use server";

import { createPublicBookingHold } from "@/domain/booking-holds/service";
import type { BookingHoldActionState } from "@/domain/booking-holds/types";
import { validatePublicBookingSearch } from "@/domain/public-booking/validation";
import { captureServerError } from "@/lib/monitoring/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { redirect } from "next/navigation";
import { createCheckoutForHold } from "@/domain/checkout/service";
import type { CheckoutActionState } from "@/domain/checkout/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createBookingHoldAction(
  marinaSlug: string,
  _state: BookingHoldActionState,
  formData: FormData,
): Promise<BookingHoldActionState> {
  const idempotencyKey = String(formData.get("holdIdempotencyKey") ?? "");
  if (!UUID.test(idempotencyKey)) return { status: "error", message: "Refresh the page and try again." };

  const supabase = createPrivilegedClient();
  const { data: marina, error } = await supabase
    .from("marinas")
    .select("timezone")
    .eq("slug", marinaSlug)
    .eq("is_public", true)
    .maybeSingle();
  if (error || !marina) return { status: "error", message: "This marina is unavailable." };

  const validation = validatePublicBookingSearch(Object.fromEntries(formData), marina.timezone);
  if (!validation.success) return { status: "error", message: validation.formError ?? "Review the stay details and check availability again." };

  try {
    const result = await createPublicBookingHold(marinaSlug, idempotencyKey, validation.data);
    if ((result.outcome === "created" || result.outcome === "existing") && result.holdToken && result.expiresAt) {
      return {
        status: "held",
        message: result.outcome === "existing" ? "Your existing hold is still active." : "Capacity is held for 15 minutes.",
        expiresAt: result.expiresAt,
        holdToken: result.holdToken,
        totalMinor: result.totalMinor ?? undefined,
        currency: result.currency ?? undefined,
      };
    }
    if (result.outcome === "unavailable") return { status: "unavailable", message: "That capacity was just taken. Check availability again." };
    if (result.outcome === "idempotency_conflict") return { status: "error", message: "The stay details changed. Refresh the page and try again." };
    if (result.outcome === "closed") return { status: "error", message: "This hold request has expired. Refresh the page to start again." };
    return { status: "error", message: "This marina is unavailable." };
  } catch (holdError) {
    captureServerError(holdError, { operation: "public_booking_hold", marinaSlug });
    return { status: "error", message: "The capacity hold could not be created. Try again." };
  }
}

export async function startBookingCheckoutAction(
  marinaSlug: string,
  _state: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const holdToken = String(formData.get("checkoutHoldToken") ?? "");
  if (!UUID.test(holdToken)) return { status: "error", message: "The capacity hold is invalid." };
  let checkoutUrl: string | null = null;
  try {
    const result = await createCheckoutForHold(holdToken);
    if (result.outcome !== "ready" || !result.url) {
      return { status: "error", message: result.outcome === "expired" ? "The capacity hold expired. Check availability again." : "Checkout is not available for this hold." };
    }
    const url = new URL(result.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Unexpected Stripe Checkout URL.");
    checkoutUrl = url.toString();
  } catch (checkoutError) {
    captureServerError(checkoutError, { operation: "stripe_checkout_create", marinaSlug });
    return { status: "error", message: "Secure checkout could not be opened. The capacity hold was released." };
  }
  redirect(checkoutUrl);
}
