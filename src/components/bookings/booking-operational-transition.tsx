"use client";

import { useActionState } from "react";
import type { OperationalTransitionActionState } from "@/app/dashboard/bookings/actions";
import type { BookingStatus } from "@/domain/bookings/types";

const INITIAL_STATE: OperationalTransitionActionState = { status: "idle" };

type OperationalAction = (
  state: OperationalTransitionActionState,
  formData: FormData,
) => Promise<OperationalTransitionActionState>;

export function BookingOperationalTransition({
  action,
  hasAssignment,
  status,
}: {
  action: OperationalAction;
  hasAssignment: boolean;
  status: BookingStatus;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const targetStatus = status === "confirmed" ? "checked_in" : status === "checked_in" ? "checked_out" : null;
  if (!targetStatus) {
    return state.message ? (
      <p className={`form-message form-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>
        {state.message}
      </p>
    ) : null;
  }

  return (
    <form action={formAction} className="booking-operational-form">
      <input name="targetStatus" type="hidden" value={targetStatus} />
      <div className="operational-transition-heading">
        <strong>{targetStatus === "checked_in" ? "Confirm vessel arrival" : "Confirm vessel departure"}</strong>
        <span>{targetStatus === "checked_in" ? "Records the actual UTC check-in time." : "Records the actual UTC check-out time and releases map occupancy."}</span>
      </div>
      {targetStatus === "checked_in" && !hasAssignment ? (
        <label className="operational-exception">
          <input name="allowUnassignedCheckIn" required type="checkbox" value="true" />
          <span>I confirm this exceptional check-in without an assigned berth. This acknowledgement will be recorded.</span>
        </label>
      ) : null}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Recording…" : targetStatus === "checked_in" ? "Confirm check-in" : "Confirm check-out"}
      </button>
      {state.message ? (
        <p className={`form-message form-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      ) : null}
    </form>
  );
}
