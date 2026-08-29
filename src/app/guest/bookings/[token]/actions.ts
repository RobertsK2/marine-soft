"use server";

import { revalidatePath } from "next/cache";
import { updateGuestBookingTimes } from "@/domain/guest-access/service";
import type { GuestTimeActionState } from "@/domain/guest-access/types";
import { validateGuestTimes } from "@/domain/guest-access/validation";
import { captureServerError } from "@/lib/monitoring/server";

export async function updateGuestBookingTimesAction(
  token: string,
  _state: GuestTimeActionState,
  formData: FormData,
): Promise<GuestTimeActionState> {
  const validation = validateGuestTimes({ eta: formData.get("eta"), etd: formData.get("etd") });
  if (!validation.success) return { status: "error", fieldErrors: validation.errors };

  try {
    const updated = await updateGuestBookingTimes(token, validation.data.eta, validation.data.etd);
    if (!updated) {
      return { status: "error", message: "This link is unavailable, expired, or the booking is no longer editable." };
    }
  } catch (error) {
    captureServerError(error, { operation: "guest_booking_time_update" });
    return { status: "error", message: "Arrival and departure times could not be saved. Try again." };
  }

  revalidatePath(`/guest/bookings/${token}`);
  return { status: "success", message: "Arrival and departure times updated." };
}
