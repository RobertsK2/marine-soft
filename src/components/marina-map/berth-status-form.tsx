"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BerthStatusActionState } from "@/app/dashboard/berths/actions";
import { BERTH_STATUSES, type BerthStatus } from "@/domain/berths/types";

const initialState: BerthStatusActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
      {pending ? "Updating..." : "Update status"}
    </button>
  );
}

export function BerthMapStatusForm({
  action,
  status,
}: {
  action: (state: BerthStatusActionState, formData: FormData) => Promise<BerthStatusActionState>;
  status: BerthStatus;
}) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="map-status-form">
      <label htmlFor="map-berth-status">Operational status</label>
      <select defaultValue={status} id="map-berth-status" name="status">
        {BERTH_STATUSES.map((value) => (
          <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
        ))}
      </select>
      <SubmitButton />
      {state.message ? (
        <p className={`form-message form-${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
