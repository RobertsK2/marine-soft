"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BookingPaymentActionState } from "@/app/dashboard/bookings/actions";
import type { BookingPaymentBalance } from "@/domain/booking-payments/types";

const initialState: BookingPaymentActionState = { status: "idle" };

export function BookingPaymentBalanceForm({
  action,
  balance,
}: {
  action: (state: BookingPaymentActionState, formData: FormData) => Promise<BookingPaymentActionState>;
  balance: BookingPaymentBalance;
}) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="booking-payment-form">
      <div className="payment-balance-summary">
        <span>Current state</span>
        <strong>{balance.state.replaceAll("_", " ")}</strong>
        {balance.overdue ? <em>OVERDUE — warning only; booking remains active</em> : null}
      </div>
      <div className="booking-payment-grid">
        <label>Payment state<select defaultValue={balance.state} name="paymentState">
          <option value="paid_in_full">Paid in full</option>
          <option value="deposit_paid">Deposit paid</option>
          <option value="balance_due">Balance due</option>
          <option value="paid_outside_berthio">Paid outside Berthio</option>
          <option value="payment_link_required">Payment link required</option>
        </select></label>
        <label>Collection method<select defaultValue={balance.collection_method} name="collectionMethod">
          <option value="berthio">Berthio</option>
          <option value="outside_berthio">Outside Berthio</option>
          <option value="payment_link">Payment link</option>
          <option value="on_site">Pay on site</option>
        </select></label>
        <label>Currency<input defaultValue={balance.currency ?? "EUR"} maxLength={3} name="currency" /></label>
        <label>Total due (minor units)<input defaultValue={balance.total_due_minor ?? ""} min="0" name="totalDueMinor" type="number" /></label>
        <label>Paid (minor units)<input defaultValue={balance.paid_minor} min="0" name="paidMinor" type="number" /></label>
        <label>Due at<input defaultValue={balance.due_at ? balance.due_at.slice(0, 16) : ""} name="dueAt" type="datetime-local" /></label>
      </div>
      <label>Payment link URL<input defaultValue={balance.payment_link_url ?? ""} name="paymentLinkUrl" type="url" placeholder="https://…" /></label>
      <label>Staff note<textarea defaultValue={balance.note ?? ""} maxLength={500} name="paymentNote" /></label>
      <SubmitButton />
      {state.message ? <p className={`form-message form-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="button button-secondary" disabled={pending} type="submit">{pending ? "Saving…" : "Save payment state"}</button>;
}
