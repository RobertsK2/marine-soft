"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BookingChangeActionState } from "@/app/dashboard/bookings/actions";
import type { Booking, BookingFieldErrors } from "@/domain/bookings/types";

const initialState: BookingChangeActionState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Revalidating..." : "Save booking changes"}
    </button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="field-error" id={id}>{message}</p> : null;
}

function describedBy(errors: BookingFieldErrors | undefined, field: keyof BookingFieldErrors) {
  return errors?.[field] ? `edit-${field}-error` : undefined;
}

export function BookingChangeForm({
  action,
  booking,
}: {
  action: (state: BookingChangeActionState, formData: FormData) => Promise<BookingChangeActionState>;
  booking: Booking;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="booking-form booking-change-form" noValidate>
      <p className="booking-change-safety-note">
        Date or dimension edits are saved only after capacity, berth fit, assignment conflicts, and server pricing pass again.
      </p>

      <section className="form-section" aria-labelledby="edit-stay-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div><h3 id="edit-stay-heading">Stay window</h3><p>Times use marina local time. Departure is not an occupied night.</p></div>
        </div>
        <div className="booking-form-grid booking-form-grid-four">
          {([
            ["arrivalDate", "Arrival date", "date", booking.arrival_date],
            ["departureDate", "Departure date", "date", booking.departure_date],
            ["eta", "ETA", "time", booking.eta.slice(0, 5)],
            ["etd", "ETD", "time", booking.etd.slice(0, 5)],
          ] as const).map(([name, label, type, value]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`edit-${name}`}>{label}</label>
              <input aria-describedby={describedBy(errors, name)} aria-invalid={Boolean(errors?.[name])} defaultValue={value} id={`edit-${name}`} name={name} required type={type} />
              <FieldError id={`edit-${name}-error`} message={errors?.[name]} />
            </div>
          ))}
        </div>
      </section>

      <section className="form-section" aria-labelledby="edit-customer-heading">
        <div className="form-section-heading">
          <span>02</span>
          <div><h3 id="edit-customer-heading">Operational customer details</h3><p>Original paid-booking snapshots remain immutable.</p></div>
        </div>
        <div className="booking-form-grid booking-form-grid-three">
          {([
            ["customerName", "Customer name", "text", booking.customer_name, "name", 160],
            ["customerEmail", "Email", "email", booking.customer_email, "email", 254],
            ["customerPhone", "Phone", "tel", booking.customer_phone, "tel", 40],
          ] as const).map(([name, label, type, value, autoComplete, maxLength]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`edit-${name}`}>{label}</label>
              <input aria-describedby={describedBy(errors, name)} aria-invalid={Boolean(errors?.[name])} autoComplete={autoComplete} defaultValue={value} id={`edit-${name}`} maxLength={maxLength} name={name} required type={type} />
              <FieldError id={`edit-${name}-error`} message={errors?.[name]} />
            </div>
          ))}
        </div>
      </section>

      <section className="form-section" aria-labelledby="edit-vessel-heading">
        <div className="form-section-heading">
          <span>03</span>
          <div><h3 id="edit-vessel-heading">Current vessel data</h3><p>Enter safe maximum dimensions in metres.</p></div>
        </div>
        <div className="booking-form-grid booking-form-grid-four">
          <div className="form-field">
            <label htmlFor="edit-vesselName">Vessel name</label>
            <input aria-describedby={describedBy(errors, "vesselName")} aria-invalid={Boolean(errors?.vesselName)} defaultValue={booking.vessel_name ?? ""} id="edit-vesselName" maxLength={120} name="vesselName" placeholder="Optional" />
            <FieldError id="edit-vesselName-error" message={errors?.vesselName} />
          </div>
          {([
            ["vesselLengthM", "Length", booking.vessel_length_m],
            ["vesselBeamM", "Beam", booking.vessel_beam_m],
            ["vesselDraftM", "Draft", booking.vessel_draft_m],
          ] as const).map(([name, label, value]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`edit-${name}`}>{label} (m)</label>
              <input aria-describedby={describedBy(errors, name)} aria-invalid={Boolean(errors?.[name])} defaultValue={value} id={`edit-${name}`} inputMode="decimal" min="0.01" name={name} required step="0.01" type="number" />
              <FieldError id={`edit-${name}-error`} message={errors?.[name]} />
            </div>
          ))}
        </div>
      </section>

      {state.message ? <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
      <div className="form-actions"><SaveButton /></div>
    </form>
  );
}
