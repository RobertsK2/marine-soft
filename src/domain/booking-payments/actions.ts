import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/auth/session";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { captureServerError } from "@/lib/monitoring/server";
import { OFFLINE_PAYMENT_METHODS, parsePaymentAmount } from "./offline";

export type RecordPaymentState = { status: "idle" | "success" | "error"; message?: string };
export type BookingPaymentActionState = RecordPaymentState;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function revalidatePayment(bookingId: string) {
  for (const path of ["/dashboard", "/dashboard/payments", "/dashboard/bookings", `/dashboard/bookings/${bookingId}`]) revalidatePath(path);
}

export async function initializeBookingTotal(
  bookingId: string, _state: BookingPaymentActionState, form: FormData,
): Promise<BookingPaymentActionState> {
  const context = await getAuthorizationContext();
  if (context?.role !== "marina_admin") return { status: "error", message: "Marina administrator access is required." };
  const amount = parsePaymentAmount(form.get("bookingTotal"));
  if (!uuid.test(bookingId) || amount === null) {
    return { status: "error", message: "Enter a positive euro amount with up to two decimal places." };
  }

  try {
    const { data, error } = await createPrivilegedClient().rpc("initialize_manual_booking_balance", {
      target_marina_id: context.marinaId, target_booking_id: bookingId, target_actor_id: context.userId,
      requested_total_minor: amount,
    });
    if (error) throw error;
    if (data === "initialized" || data === "already_initialized") {
      revalidatePayment(bookingId);
      return { status: "success", message: data === "initialized" ? "Booking total saved." : "A booking total is already set." };
    }
    return { status: "error", message: "A booking total cannot be set for this booking." };
  } catch (error) {
    captureServerError(error, { operation: "initialize_booking_total", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "The booking total could not be saved. Try again." };
  }
}

export async function savePaymentSettings(
  bookingId: string, savedLink: string | null, _state: BookingPaymentActionState, form: FormData,
): Promise<BookingPaymentActionState> {
  const context = await getAuthorizationContext();
  if (context?.role !== "marina_admin") return { status: "error", message: "Marina administrator access is required." };
  if (!uuid.test(bookingId)) return { status: "error", message: "The booking reference is invalid." };
  const link = form.get("paymentLink");
  const dueAt = form.get("paymentDueAt");
  if (typeof link !== "string" || typeof dueAt !== "string") {
    return { status: "error", message: "Submit the payment link and due date fields." };
  }
  const normalizedLink = link.trim() || null;
  const invalidLink = "Enter a valid HTTPS payment link.";
  const invalidDueAt = "Enter a valid due date and time in the marina’s timezone.";
  if (normalizedLink && normalizedLink !== savedLink) {
    const url = URL.canParse(normalizedLink) ? new URL(normalizedLink) : null;
    if (!/^https:\/\//i.test(normalizedLink) || /[\s\\]/.test(normalizedLink)
      || normalizedLink.length > 2048 || !url?.hostname || url.username || url.password) {
      return { status: "error", message: invalidLink };
    }
  }
  if (dueAt) {
    const date = new Date(`${dueAt}Z`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueAt) || Number.isNaN(date.valueOf())
      || date.toISOString().slice(0, 16) !== dueAt) return { status: "error", message: invalidDueAt };
  }

  try {
    const { data, error } = await createPrivilegedClient().rpc("update_booking_payment_settings", {
      target_marina_id: context.marinaId, target_booking_id: bookingId, target_actor_id: context.userId,
      requested_payment_link: normalizedLink, requested_due_at: dueAt || null,
    });
    if (error) throw error;
    if (data === "updated" || data === "unchanged") {
      revalidatePayment(bookingId);
      return { status: "success", message: "Payment settings saved." };
    }
    if (data === "invalid_link") return { status: "error", message: invalidLink };
    if (data === "invalid_due_at") return { status: "error", message: invalidDueAt };
    return { status: "error", message: "Payment settings are unavailable for this booking." };
  } catch (error) {
    captureServerError(error, { operation: "update_payment_settings", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "Payment settings could not be saved. Try again." };
  }
}

export async function recordOfflinePayment(
  bookingId: string, _state: RecordPaymentState, form: FormData,
): Promise<RecordPaymentState> {
  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };
  const requestId = String(form.get("requestId") ?? "");
  const amount = parsePaymentAmount(form.get("amount"));
  const method = String(form.get("method") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const expectedPaid = String(form.get("expectedPaidMinor") ?? "");
  if (!uuid.test(bookingId) || !uuid.test(requestId) || amount === null
    || !Object.hasOwn(OFFLINE_PAYMENT_METHODS, method) || note.length > 500
    || !/^\d+$/.test(expectedPaid) || !Number.isSafeInteger(Number(expectedPaid))) {
    return { status: "error", message: "Enter a valid amount and payment method. Notes can contain up to 500 characters." };
  }
  try {
    const { data, error } = await createPrivilegedClient().rpc("record_booking_offline_payment", {
      target_marina_id: context.marinaId, target_booking_id: bookingId, target_actor_id: context.userId, target_actor_label: context.email ?? context.userId,
      requested_request_id: requestId, requested_currency: "EUR", requested_amount_minor: amount,
      requested_method: method, requested_note: note || null, expected_paid_minor: Number(expectedPaid),
    });
    if (error) throw error;
    const outcome = data?.[0]?.outcome;
    if (outcome === "recorded" || outcome === "already_recorded") {
      revalidatePayment(bookingId);
      return { status: "success", message: outcome === "recorded" ? "Payment recorded." : "This payment was already recorded. No duplicate was added." };
    }
    const messages: Record<string, string> = {
      unauthorized: "Marina access is required.", not_found: "Booking not found for this marina.",
      stale: "Another payment was recorded. Refresh the page and check the remaining balance before continuing.",
      excessive_amount: "Amount received must not exceed the remaining balance.",
      idempotency_conflict: "This request was already used. Refresh and check payment history before recording another payment.",
      cancelled: "Payments cannot be recorded against a cancelled booking.",
      not_offline: "This booking is not eligible for recording a euro payment at the marina.",
      balance_required: "Ask a marina administrator to set the booking total first.",
      invalid_payment: "Enter a valid positive euro amount and payment method.",
    };
    if (outcome && messages[outcome]) return { status: "error", message: messages[outcome] };
    throw new Error("Unexpected offline payment result.");
  } catch (error) {
    captureServerError(error, { operation: "record_offline_payment", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "The payment could not be confirmed. Retry this form to safely check the same payment request." };
  }
}
