"use client";

import { useActionState, useRef, useState } from "react";
import type { RecordPaymentState } from "@/domain/booking-payments/actions";
import { OFFLINE_PAYMENT_METHODS } from "@/domain/booking-payments/offline";
import styles from "./record-payment-form.module.css";

export function RecordPaymentForm({ action, remainingMinor, paidMinor }: {
  action: (state: RecordPaymentState, form: FormData) => Promise<RecordPaymentState>;
  remainingMinor: number;
  paidMinor: number;
}) {
  // Keep the request identity through errors and retries, including a lost
  // response after a commit. Only an acknowledged success starts a new request.
  const requestId = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState(async (previous: RecordPaymentState, form: FormData) => {
    const result = await action(previous, form);
    if (result.status === "success") requestId.current = null;
    return result;
  }, { status: "idle" });

  return <>
    {remainingMinor > 0 ? <details className={styles.disclosure}>
      <summary>Record payment</summary>
      <form key={paidMinor} className={styles.form} action={(form) => {
        requestId.current ??= crypto.randomUUID();
        form.set("requestId", requestId.current);
        formAction(form);
      }}>
        <input type="hidden" name="expectedPaidMinor" value={paidMinor} />
        <PaymentFields remainingMinor={remainingMinor} />
        <button type="submit" disabled={pending}>{pending ? "Recording…" : "Record payment"}</button>
      </form>
    </details> : null}
    {state.message ? <p className={styles.message} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </>;
}

function PaymentFields({ remainingMinor }: { remainingMinor: number }) {
  // Controlled fields preserve the exact payload on errors. The form's paid
  // amount key resets them after a collection, without losing the success text.
  const [amount, setAmount] = useState((remainingMinor / 100).toFixed(2));
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  return <>
    <label>Amount received (€)
      <input name="amount" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required maxLength={17} autoComplete="off" />
    </label>
    <label>Payment method
      <select name="method" value={method} onChange={event => setMethod(event.target.value)} required>
        <option value="" disabled>Select method</option>
        {Object.entries(OFFLINE_PAYMENT_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <p className={styles.hint}>Record money already received. Card terminal does not charge a card.</p>
    <label>Note (optional)<textarea name="note" rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
  </>;
}
