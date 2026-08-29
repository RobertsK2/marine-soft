"use client";

import { useActionState } from "react";
import type { BerthAssignmentActionState } from "@/app/dashboard/bookings/actions";
import type { BookingBerthAssignmentState } from "@/domain/berth-assignments/types";

type AssignmentAction = (
  state: BerthAssignmentActionState,
  formData: FormData,
) => Promise<BerthAssignmentActionState>;

const INITIAL_STATE: BerthAssignmentActionState = { status: "idle" };

export function BerthAssignmentForm({
  action,
  assignment,
  assignable,
}: {
  action: AssignmentAction;
  assignment: BookingBerthAssignmentState;
  assignable: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const openOptions = assignment.options.filter((option) => !option.conflict);
  const conflicts = assignment.options.length - openOptions.length;

  return (
    <div className="berth-assignment-control">
      <div className="assignment-status-line">
        <span>Assignment status</span>
        <strong>{assignment.current ? `Berth ${assignment.current.berthCode}` : "Capacity-based / unassigned"}</strong>
      </div>

      {assignable && assignment.options.length > 0 ? (
        <form action={formAction} className="berth-assignment-form">
          <label htmlFor="berthId">Suitable operational berth</label>
          <select defaultValue={assignment.current?.berthId ?? ""} id="berthId" name="berthId" required>
            <option disabled value="">Choose a real berth</option>
            {assignment.options.map((option) => (
              <option disabled={option.conflict} key={option.berthId} value={option.berthId}>
                {option.code} / {option.zone} / {option.maxLengthM.toFixed(2)} × {option.maxBeamM.toFixed(2)} × {option.maxDraftM.toFixed(2)} m{option.conflict ? " / CONFLICT" : ""}
              </option>
            ))}
          </select>
          <button className="button button-primary" disabled={pending || openOptions.length === 0} type="submit">
            {pending ? "Checking assignment…" : assignment.current ? "Reassign berth" : "Assign berth"}
          </button>
        </form>
      ) : (
        <p className="assignment-warning">
          {assignable ? "No operational berth safely fits this vessel." : "Only confirmed bookings can be assigned in this phase."}
        </p>
      )}

      {conflicts > 0 ? <p className="assignment-warning">{conflicts} suitable berth{conflicts === 1 ? " has" : "s have"} an overlapping real assignment and cannot be selected.</p> : null}
      {state.message ? <p className={`form-message form-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}

      {assignment.history.length > 0 ? (
        <div className="assignment-history">
          <h3>Assignment history</h3>
          <ol>
            {assignment.history.map((item) => (
              <li key={item.id}>
                <strong>{item.berthCode}</strong>
                <span>{item.arrivalDate} → {item.departureDate}</span>
                <small>{item.endedAt ? "Reassigned" : "Current"}</small>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
