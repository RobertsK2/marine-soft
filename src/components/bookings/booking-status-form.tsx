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
      <div className="booking-status-control">
        <select defaultValue={status} id="status" name="status">
          {(["confirmed", "cancelled"] as const).map((value) => (
            <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
          ))}
        </select>
        <StatusSubmit />
      </div>
      {state.status === "confirmation" && state.cancellation ? (
        <div className="booking-cancellation-confirmation" role="alert">
          <strong>Cancellation review</strong>
          <p>{state.message}</p>
          <dl>
            <div><dt>Policy</dt><dd>{state.cancellation.policyCode.replaceAll("_", " ")}</dd></div>
            <div><dt>Recommended refund</dt><dd>{state.cancellation.refundRecommendationMinor !== null && state.cancellation.currency
              ? `${new Intl.NumberFormat("en-GB", { style: "currency", currency: state.cancellation.currency }).format(state.cancellation.refundRecommendationMinor / 100)} (${state.cancellation.refundPercent}%)`
              : "Not available"}</dd></div>
            <div><dt>Capacity release</dt><dd>{state.cancellation.assignmentCount} active berth assignment(s)</dd></div>
          </dl>
          <label htmlFor="cancellationReason">Cancellation reason</label>
          <textarea id="cancellationReason" name="cancellationReason" maxLength={500} placeholder="Record why staff cancelled this booking." required />
          <input name="status" type="hidden" value="cancelled" />
          <input name="confirmCancellation" type="hidden" value="true" />
          <button className="button button-primary" type="submit">Confirm cancellation</button>
        </div>
      ) : null}
      {state.message && state.status !== "confirmation" ? <p className={`form-message form-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}
