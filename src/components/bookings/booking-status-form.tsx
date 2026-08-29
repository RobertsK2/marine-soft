"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BookingActionState } from "@/app/dashboard/bookings/actions";
import type { BookingStatus } from "@/domain/bookings/types";

const initialState: BookingActionState = { status: "idle" };

function StatusSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-secondary" disabled={pending} type="submit">
      {pending ? "Updating..." : "Update status"}
    </button>
  );
}

export function BookingStatusForm({
  action,
  status,
}: {
  action: (state: BookingActionState, formData: FormData) => Promise<BookingActionState>;
  status: BookingStatus;
}) {
  const [state, formAction] = useActionState(action, initialState);
  if (status !== "confirmed") return null;
  return (
    <form action={formAction} className="booking-status-form">
      <label htmlFor="status">Booking status</label>
      <div>
        <select defaultValue={status} id="status" name="status">
          {(["confirmed", "cancelled"] as const).map((value) => (
            <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
          ))}
        </select>
        <StatusSubmit />
      </div>
      {state.message ? <p className="form-message form-error" role="alert">{state.message}</p> : null}
    </form>
  );
}
