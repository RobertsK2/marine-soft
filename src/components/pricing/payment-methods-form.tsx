"use client";

import { useActionState } from "react";
import { updatePaymentMethodsAction, type PaymentMethodsActionState } from "@/app/dashboard/settings/pricing/actions";

function PaymentMethodToggle({ name, label, description, enabled }: { name: string; label: string; description: string; enabled: boolean }) {
  return <label className="payment-method-row">
    <span className="payment-method-copy">
      <span id={`${name}-label`} className="payment-method-label">{label}</span>
      <span id={`${name}-help`} className="payment-method-description">{description}</span>
    </span>
    <input aria-labelledby={`${name}-label`} aria-describedby={`${name}-help`} defaultChecked={enabled} role="switch" type="checkbox" name={name} />
  </label>;
}

export function PaymentMethodsForm({ online, atMarina, updatedAt }: { online: boolean; atMarina: boolean; updatedAt: string }) {
  const [state, action, pending] = useActionState(updatePaymentMethodsAction.bind(null, updatedAt), { status: "idle" } as PaymentMethodsActionState);
  return <form action={action} className="payment-methods-settings">
    <fieldset disabled={pending}>
      <legend>Accepted booking payment methods</legend>
      <p className="payment-methods-help">Enable at least one method. Existing bookings keep their original payment arrangements.</p>
      <div className="payment-methods-list">
        <PaymentMethodToggle name="onlinePayment" label="Pay Online" description="Allow guests to pay online when booking." enabled={online} />
        <PaymentMethodToggle name="payAtMarina" label="Allow Pay at Marina" description="Allow guests to book online and pay directly at the marina." enabled={atMarina} />
      </div>
      <div className="payment-methods-actions">
        <button className="button button-primary" type="submit">{pending ? "Saving…" : "Save payment methods"}</button>
      </div>
    </fieldset>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
