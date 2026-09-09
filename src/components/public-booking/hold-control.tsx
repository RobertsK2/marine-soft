"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { startBookingCheckoutAction } from "@/app/marina/[slug]/actions";
import type { CheckoutActionState } from "@/domain/checkout/types";

const initialState: CheckoutActionState = { status: "idle" };

export function HoldControl({ idempotencyKey, marinaSlug, online, atMarina }: { idempotencyKey: string; marinaSlug: string; online: boolean; atMarina: boolean }) {
  const [method, setMethod] = useState(online ? "online" : "marina");
  // A server refresh must not turn a payment retry into a new booking attempt.
  const [attemptKey] = useState(idempotencyKey);
  const [state, formAction, pending] = useActionState(startBookingCheckoutAction.bind(null, marinaSlug), initialState);
  return <div className="public-hold-control" aria-busy={pending}>
    {online && atMarina ? <fieldset className="public-payment-methods" disabled={pending}>
      <legend>Payment method</legend>
      <label><input type="radio" name="paymentMethod" value="online" checked={method === "online"} onChange={() => setMethod("online")} /><span><strong>Pay now</strong><small>Secure online payment</small></span></label>
      <label><input type="radio" name="paymentMethod" value="marina" checked={method === "marina"} onChange={() => setMethod("marina")} /><span><strong>Pay at marina</strong><small>Pay when you arrive</small></span></label>
    </fieldset> : <input name="paymentMethod" type="hidden" value={method} />}
    {atMarina ? <fieldset className="public-customer-details" hidden={method !== "marina"} disabled={pending || method !== "marina"}>
      <legend>Your contact details</legend>
      {([ ["customerName", "Full name", "text", "name", 160], ["customerEmail", "Email", "email", "email", 254], ["customerPhone", "Phone", "tel", "tel", 40] ] as const).map(([name, label, type, autoComplete, maxLength]) => <div className="form-field" key={name}>
        <label htmlFor={`public-${name}`}>{label}</label>
        <input id={`public-${name}`} name={name} type={type} autoComplete={autoComplete} required maxLength={maxLength} aria-invalid={Boolean(state.fieldErrors?.[name])} aria-describedby={state.fieldErrors?.[name] ? `${name}-error` : undefined} />
        {state.fieldErrors?.[name] ? <p className="field-error" id={`${name}-error`}>{state.fieldErrors[name]}</p> : null}
      </div>)}
      <p>The full booking total is due at the marina. No payment is collected now.</p>
    </fieldset> : null}
    <input name="holdIdempotencyKey" type="hidden" value={attemptKey} />
    <button className="button button-primary button-large" disabled={pending || state.requiresAvailabilityCheck} formAction={formAction} type="submit">
      {pending ? <LoaderCircle aria-hidden="true" size={17} /> : <LockKeyhole aria-hidden="true" size={17} />}
      {pending
        ? method === "online" ? "Opening secure payment…" : "Confirming booking…"
        : method === "online" ? "Continue to Payment" : "Confirm Booking"}
    </button>
    {state.status === "error" ? <p className="public-hold-message public-hold-error" role="alert">{state.message}</p> : null}
  </div>;
}
