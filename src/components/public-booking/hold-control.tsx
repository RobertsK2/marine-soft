"use client";

import { useActionState } from "react";
import { LockKeyhole } from "lucide-react";
import { createBookingHoldAction } from "@/app/marina/[slug]/actions";
import type { BookingHoldActionState } from "@/domain/booking-holds/types";

const initialState: BookingHoldActionState = { status: "idle" };

export function HoldControl({ idempotencyKey, marinaSlug }: { idempotencyKey: string; marinaSlug: string }) {
  const action = createBookingHoldAction.bind(null, marinaSlug);
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <div className="public-hold-control">
      <input name="holdIdempotencyKey" type="hidden" value={idempotencyKey} />
      <button className="button button-primary button-large" disabled={pending || state.status === "held"} formAction={formAction} type="submit">
        <LockKeyhole aria-hidden="true" size={17} />
        {pending ? "Securing capacity…" : state.status === "held" ? "Capacity held" : "Continue to payment"}
      </button>
      {state.status !== "idle" ? (
        <p className={`public-hold-message public-hold-${state.status}`} data-hold-token={state.holdToken} role="status">
          <strong>{state.message}</strong>
          {state.expiresAt ? <> Hold expires at {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.expiresAt))}.</> : null}
        </p>
      ) : null}
    </div>
  );
}
