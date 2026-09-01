"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BookingExtensionActionState } from "@/app/dashboard/bookings/actions";

type ExtensionAction = (
  state: BookingExtensionActionState,
  formData: FormData,
) => Promise<BookingExtensionActionState>;

const INITIAL_STATE: BookingExtensionActionState = { status: "idle" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountMinor / 100);
}

export function BookingExtensionForm({
  confirmAction,
  currentDeparture,
  previewAction,
}: {
  confirmAction: ExtensionAction;
  currentDeparture: string;
  previewAction: ExtensionAction;
}) {
  const [previewState, previewFormAction] = useActionState(previewAction, INITIAL_STATE);
  const [confirmState, confirmFormAction] = useActionState(confirmAction, INITIAL_STATE);
  const preview = previewState.status === "preview" ? previewState.preview : undefined;

  return (
    <div className="booking-extension-control">
      <form action={previewFormAction} className="booking-extension-preview-form">
        <div>
          <label htmlFor="requestedDeparture">New departure date</label>
          <input
            defaultValue={nextDate(currentDeparture)}
            id="requestedDeparture"
            min={nextDate(currentDeparture)}
            name="requestedDeparture"
            required
            type="date"
          />
        </div>
        <SubmitButton label="Preview extension" pendingLabel="Validating..." />
      </form>

      {previewState.message ? (
        <p className={`form-message ${previewState.status === "error" ? "form-error" : "form-success"}`} role={previewState.status === "error" ? "alert" : "status"}>
          {previewState.message}
        </p>
      ) : null}

      {preview ? (
        <section className="extension-confirmation" aria-label="Extension confirmation preview">
          <div className="extension-route">
            <span><small>Current departure</small><strong>{preview.originalDeparture}</strong></span>
            <ArrowRight size={18} aria-hidden="true" />
            <span><small>New departure</small><strong>{preview.requestedDeparture}</strong></span>
            <span className="extension-night-count">+{preview.addedNights} night{preview.addedNights === 1 ? "" : "s"}</span>
          </div>

          <dl className="extension-preview-details">
            <div><dt>Berth plan</dt><dd>{preview.moveRequired
              ? `Move required after ${preview.originalDeparture}`
              : preview.currentBerthCode
                ? `Remain at berth ${preview.currentBerthCode}`
                : "Capacity-based / unassigned"}</dd></div>
            {preview.currency && preview.previousTotalMinor !== null && preview.revisedTotalMinor !== null ? (
              <>
                <div><dt>Current revised total</dt><dd>{money(preview.previousTotalMinor, preview.currency)}</dd></div>
                <div><dt>Extension total</dt><dd>{money(preview.revisedTotalMinor, preview.currency)}</dd></div>
                <div><dt>Financial position</dt><dd>{preview.differenceFromPaidMinor !== null
                  ? preview.differenceFromPaidMinor > 0
                    ? `${money(preview.differenceFromPaidMinor, preview.currency)} due after confirmation`
                    : preview.differenceFromPaidMinor < 0
                      ? `${money(Math.abs(preview.differenceFromPaidMinor), preview.currency)} refundable; no automatic refund`
                      : "Settled against the original payment"
                  : "No financial change"}</dd></div>
              </>
            ) : <div><dt>Financial position</dt><dd>Manual booking — no paid price snapshot to revise</dd></div>}
          </dl>

          <form action={confirmFormAction} className="extension-confirm-form">
            <input name="requestedDeparture" type="hidden" value={preview.requestedDeparture} />
            {preview.moveRequired ? (
              <div>
                <label htmlFor="moveBerthId">Planned move berth</label>
                <select id="moveBerthId" name="moveBerthId" required defaultValue="">
                  <option disabled value="">Choose a confirmed alternative</option>
                  {preview.berthOptions.map((option) => (
                    <option key={option.berthId} value={option.berthId}>
                      {option.code} · {option.zone} · {option.maxLengthM.toFixed(2)} × {option.maxBeamM.toFixed(2)} m · draft {option.maxDraftM.toFixed(2)} m
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <p className="extension-confirm-warning">
              Confirmation rechecks capacity, berth conflicts, and price in one transaction. No berth move or payment occurs silently.
            </p>
            <SubmitButton label={preview.moveRequired ? "Confirm extension and move" : "Confirm extension"} pendingLabel="Rechecking and saving..." />
          </form>
        </section>
      ) : null}

      {confirmState.message ? (
        <p className={`form-message ${confirmState.status === "success" ? "form-success" : "form-error"}`} role={confirmState.status === "error" ? "alert" : "status"}>
          {confirmState.message}
        </p>
      ) : null}
    </div>
  );
}

