"use client";

import { useActionState, useState } from "react";
import type { BookingPaymentActionState } from "@/domain/booking-payments/actions";

type Action = (state: BookingPaymentActionState, form: FormData) => Promise<BookingPaymentActionState>;
const initialState: BookingPaymentActionState = { status: "idle" };

export function BookingPaymentSettingsForm({ action, savedLink, savedDueAt, timezone }: {
  action: Action;
  savedLink: string;
  savedDueAt: string;
  timezone: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [link, setLink] = useState(savedLink);
  const [dueAt, setDueAt] = useState(savedDueAt);

  return <form action={submit} className="booking-payment-form">
    <label>Payment link (optional)
      <input name="paymentLink" inputMode="url" maxLength={2048} value={link} onChange={event => setLink(event.target.value)} />
    </label>
    <label>Payment due date (optional)
      <input name="paymentDueAt" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} />
    </label>
    <p className="assignment-intro">Due dates use {timezone}. The payment link is included in balance reminders.</p>
    <button className="button button-secondary" disabled={pending} type="submit">{pending ? "Saving…" : "Save payment settings"}</button>
    <PaymentFormMessage state={state} />
  </form>;
}

export function SetBookingTotalForm({ action, initialTotal }: { action: Action; initialTotal: string }) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [total, setTotal] = useState(initialTotal);

  return <form action={submit} className="booking-payment-form">
    <label>Booking total (€)
      <input name="bookingTotal" required inputMode="decimal" maxLength={17} value={total} onChange={event => setTotal(event.target.value)} />
    </label>
    <button className="button button-secondary" disabled={pending} type="submit">{pending ? "Saving…" : "Set booking total"}</button>
    <PaymentFormMessage state={state} />
  </form>;
}

function PaymentFormMessage({ state }: { state: BookingPaymentActionState }) {
  return state.message ? <p className={`form-message form-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null;
}
