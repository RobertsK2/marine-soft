"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BookingActionState } from "@/app/dashboard/bookings/actions";
import type { BookingFieldErrors } from "@/domain/bookings/types";

const initialState: BookingActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Creating..." : "Create booking"}
    </button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="field-error" id={id}>{message}</p> : null;
}

function describedBy(errors: BookingFieldErrors | undefined, field: keyof BookingFieldErrors) {
  return errors?.[field] ? `${field}-error` : undefined;
}

export function BookingForm({
  action,
}: {
  action: (state: BookingActionState, formData: FormData) => Promise<BookingActionState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="booking-form" noValidate>
      <section className="form-section" aria-labelledby="stay-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2 id="stay-heading">Stay window</h2>
            <p>Departure is the checkout date and is not an occupied night.</p>
          </div>
        </div>
        <div className="booking-form-grid booking-form-grid-four">
          {([
            ["arrivalDate", "Arrival date", "date"],
            ["departureDate", "Departure date", "date"],
            ["eta", "ETA", "time"],
            ["etd", "ETD", "time"],
          ] as const).map(([name, label, type]) => (
            <div className="form-field" key={name}>
              <label htmlFor={name}>{label}</label>
              <input
                aria-describedby={describedBy(errors, name)}
                aria-invalid={Boolean(errors?.[name])}
                id={name}
                name={name}
                required
                type={type}
              />
              <FieldError id={`${name}-error`} message={errors?.[name]} />
            </div>
          ))}
        </div>
      </section>

      <section className="form-section" aria-labelledby="customer-heading">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2 id="customer-heading">Customer snapshot</h2>
            <p>These details remain with this booking if a customer profile changes later.</p>
          </div>
        </div>
        <div className="booking-form-grid booking-form-grid-three">
          <div className="form-field">
            <label htmlFor="customerName">Customer name</label>
            <input aria-describedby={describedBy(errors, "customerName")} aria-invalid={Boolean(errors?.customerName)} autoComplete="name" id="customerName" maxLength={160} name="customerName" required />
            <FieldError id="customerName-error" message={errors?.customerName} />
          </div>
          <div className="form-field">
            <label htmlFor="customerEmail">Email</label>
            <input aria-describedby={describedBy(errors, "customerEmail")} aria-invalid={Boolean(errors?.customerEmail)} autoComplete="email" id="customerEmail" maxLength={254} name="customerEmail" required type="email" />
            <FieldError id="customerEmail-error" message={errors?.customerEmail} />
          </div>
          <div className="form-field">
            <label htmlFor="customerPhone">Phone</label>
            <input aria-describedby={describedBy(errors, "customerPhone")} aria-invalid={Boolean(errors?.customerPhone)} autoComplete="tel" id="customerPhone" maxLength={40} name="customerPhone" required type="tel" />
            <FieldError id="customerPhone-error" message={errors?.customerPhone} />
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby="vessel-heading">
        <div className="form-section-heading">
          <span>03</span>
          <div>
            <h2 id="vessel-heading">Vessel snapshot</h2>
            <p>Enter safe maximum dimensions in metres. Vessel name is optional.</p>
          </div>
        </div>
        <div className="booking-form-grid booking-form-grid-four">
          <div className="form-field">
            <label htmlFor="vesselName">Vessel name</label>
            <input aria-describedby={describedBy(errors, "vesselName")} aria-invalid={Boolean(errors?.vesselName)} id="vesselName" maxLength={120} name="vesselName" placeholder="Optional" />
            <FieldError id="vesselName-error" message={errors?.vesselName} />
          </div>
          {([
            ["vesselLengthM", "Length"],
            ["vesselBeamM", "Beam"],
            ["vesselDraftM", "Draft"],
          ] as const).map(([name, label]) => (
            <div className="form-field" key={name}>
              <label htmlFor={name}>{label} (m)</label>
              <input
                aria-describedby={describedBy(errors, name)}
                aria-invalid={Boolean(errors?.[name])}
                id={name}
                inputMode="decimal"
                min="0.01"
                name={name}
                required
                step="0.01"
                type="number"
              />
              <FieldError id={`${name}-error`} message={errors?.[name]} />
            </div>
          ))}
        </div>
      </section>

      {state.message ? <p className="form-message form-error" role="alert">{state.message}</p> : null}
      <div className="form-actions">
        <SubmitButton />
        <Link className="button button-secondary" href="/dashboard/bookings">Cancel</Link>
      </div>
    </form>
  );
}
