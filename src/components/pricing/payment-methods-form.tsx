"use client";

import { useActionState } from "react";
import { updatePaymentMethodsAction, type PaymentMethodsActionState } from "@/app/dashboard/settings/pricing/actions";

export function PaymentMethodsForm({ online, atMarina, updatedAt }: { online: boolean; atMarina: boolean; updatedAt: string }) {
  const [state, action, pending] = useActionState(updatePaymentMethodsAction.bind(null, updatedAt), { status: "idle" } as PaymentMethodsActionState);
  return <form action={action} className="payment-methods-settings">
    <fieldset disabled={pending}>
      <legend>Accepted booking payment methods</legend>
      <p>Enable at least one method. Existing bookings keep their original payment arrangements.</p>
      <label><input defaultChecked={online} type="checkbox" name="onlinePayment" /> Online payment</label>
      <label><input defaultChecked={atMarina} type="checkbox" name="payAtMarina" /> Pay at marina</label>
      <button className="button button-secondary" type="submit">{pending ? "Saving…" : "Save payment methods"}</button>
    </fieldset>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
