"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { GuestTimeActionState } from "@/domain/guest-access/types";

const initialState: GuestTimeActionState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Saving..." : "Update ETA / ETD"}
    </button>
  );
}

export function GuestTimesForm({
  action,
  eta,
  etd,
}: {
  action: (state: GuestTimeActionState, formData: FormData) => Promise<GuestTimeActionState>;
  eta: string;
  etd: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="guest-times-form" noValidate>
      <div className="guest-times-fields">
        <div className="form-field">
          <label htmlFor="guest-eta">ETA</label>
          <input aria-describedby={state.fieldErrors?.eta ? "guest-eta-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.eta)} defaultValue={eta.slice(0, 5)} id="guest-eta" name="eta" required type="time" />
          {state.fieldErrors?.eta ? <p className="field-error" id="guest-eta-error">{state.fieldErrors.eta}</p> : null}
        </div>
        <div className="form-field">
          <label htmlFor="guest-etd">ETD</label>
          <input aria-describedby={state.fieldErrors?.etd ? "guest-etd-error" : undefined} aria-invalid={Boolean(state.fieldErrors?.etd)} defaultValue={etd.slice(0, 5)} id="guest-etd" name="etd" required type="time" />
          {state.fieldErrors?.etd ? <p className="field-error" id="guest-etd-error">{state.fieldErrors.etd}</p> : null}
        </div>
      </div>
      {state.message ? <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role="status">{state.message}</p> : null}
      <SaveButton />
    </form>
  );
}
