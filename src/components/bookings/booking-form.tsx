"use client";

import { Anchor, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import type { BookingActionState } from "@/app/dashboard/bookings/actions";
import type { BookingField, BookingFieldErrors } from "@/domain/bookings/types";
import { bookingNights } from "@/domain/bookings/formatting";
import styles from "./create-booking.module.css";

const initialState: BookingActionState = { status: "idle" };
const initialValues: Record<BookingField, string> = { arrivalDate: "", departureDate: "", eta: "", etd: "", customerName: "", customerEmail: "", customerPhone: "", vesselName: "", vesselLengthM: "", vesselBeamM: "", vesselDraftM: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className={styles.submit} disabled={pending} type="submit">
    {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
    {pending ? "Creating..." : "Create booking"}
  </button>;
}

function Field({ name, label, errors, value, onChange, ...props }: {
  name: BookingField; label: string; errors?: BookingFieldErrors; value: string; onChange: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "onChange" | "value">) {
  return <div className={styles.field}>
    <label htmlFor={name} data-required={props.required}>{label}</label>
    <input {...props} id={name} name={name} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(errors?.[name])} aria-describedby={errors?.[name] ? `${name}-error` : undefined} />
    {errors?.[name] ? <p className={styles.fieldError} id={`${name}-error`}>{errors[name]}</p> : null}
  </div>;
}

export function BookingForm({ action, timezone }: {
  action: (state: BookingActionState, formData: FormData) => Promise<BookingActionState>;
  timezone: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [values, setValues] = useState(initialValues);
  const form = useRef<HTMLFormElement>(null);
  const errors = state.fieldErrors;
  useEffect(() => {
    if (state.fieldErrors) form.current?.querySelector<HTMLInputElement>("input[aria-invalid=true]")?.focus();
  }, [state]);
  const field = (name: BookingField, label: string, props: Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange"> = {}) => <Field key={name} name={name} label={label} value={values[name]} onChange={(value) => setValues((current) => ({ ...current, [name]: value }))} errors={errors} {...props} />;
  const rawNights = bookingNights(values.arrivalDate, values.departureDate);
  const nights = Number.isFinite(rawNights) && rawNights > 0 ? rawNights : null;

  return <form action={formAction} ref={form} className={styles.form} noValidate>
    <div className={styles.main}>
      <section className={styles.card} aria-labelledby="guest-vessel-heading">
        <header className={styles.sectionHeading}><span>1</span><h2 id="guest-vessel-heading">Guest & vessel</h2></header>
        <div className={styles.threeColumns}>
          {field("customerName", "Customer name", { required: true, maxLength: 160, autoComplete: "name" })}
          {field("customerPhone", "Phone", { required: true, type: "tel", maxLength: 40, autoComplete: "tel" })}
          {field("customerEmail", "Email", { required: true, type: "email", maxLength: 254, autoComplete: "email" })}
        </div>
        <div className={styles.threeColumns}>
          {([ ["vesselLengthM", "Length (m)"], ["vesselBeamM", "Beam (m)"], ["vesselDraftM", "Draft (m)"] ] as const).map(([name, label]) => field(name, label, { type: "number", required: true, inputMode: "decimal", min: "0.01", step: "0.01" }))}
        </div>
        <details className={styles.optional} open={errors?.vesselName ? true : undefined}><summary>Optional vessel details</summary><div>{field("vesselName", "Vessel name", { maxLength: 120, placeholder: "Optional" })}</div></details>
        <p className={styles.helper}>Enter maximum vessel dimensions for a safe berth fit.</p>
      </section>
      <section className={styles.card} aria-labelledby="stay-heading">
        <header className={styles.sectionHeading}><span>2</span><h2 id="stay-heading">Stay</h2>{nights ? <small>{nights} night{nights === 1 ? "" : "s"}</small> : null}</header>
        <div className={styles.stayGrid}>
          <div className={styles.stayCard}><h3>Check-in / arrival</h3><div>{field("arrivalDate", "Arrival date", { type: "date", required: true })}{field("eta", "ETA", { type: "time", required: true })}</div></div>
          <div className={styles.stayCard}><h3>Check-out / departure</h3><div>{field("departureDate", "Departure date", { type: "date", required: true })}{field("etd", "ETD", { type: "time", required: true })}</div></div>
        </div>
        <p className={styles.helper}>Times use {timezone}. The departure date is not an occupied night.</p>
      </section>
      <section className={styles.card} aria-labelledby="requirements-heading">
        <header className={styles.sectionHeading}><span>3</span><h2 id="requirements-heading">Berth / booking requirements</h2></header>
        <div className={styles.requirement}><Anchor size={21} aria-hidden="true" /><div><strong>Reserve suitable berth capacity</strong><p>Capacity is checked against vessel dimensions and the full stay when you create the booking. Assign a physical berth from the booking details afterward.</p></div></div>
      </section>
    </div>
    <aside className={`${styles.card} ${styles.summary}`} aria-labelledby="summary-heading">
      <h2 id="summary-heading">Booking summary</h2>
      <dl>
        <div><dt>Guest</dt><dd>{values.customerName.trim() || "Not entered"}</dd></div>
        <div><dt>Vessel</dt><dd>{values.vesselName.trim() || "Name not entered"}<small>{values.vesselLengthM || "—"} × {values.vesselBeamM || "—"} × {values.vesselDraftM || "—"} m</small></dd></div>
        <div><dt>Stay</dt><dd>{values.arrivalDate && values.departureDate ? `${values.arrivalDate} – ${values.departureDate}` : "Select dates"}{nights ? <small>{nights} night{nights === 1 ? "" : "s"}</small> : null}</dd></div>
        <div><dt>Berth</dt><dd className={styles.capacity}>Suitable capacity<small>Physical assignment after creation</small></dd></div>
      </dl>
      <div className={styles.total}><span>Total amount</span><strong>Not calculated</strong></div>
      <p className={styles.helper}>Manual creation does not calculate a price or collect payment. Manage the payment balance after creating the booking.</p>
      {state.message ? <p className={styles.formError} role="alert">{state.message}</p> : null}
      {errors && Object.keys(errors).length ? <p className={styles.formError} role="alert">Check the highlighted fields before creating the booking.</p> : null}
      <SubmitButton />
      <Link className={styles.cancel} href="/dashboard/bookings">Cancel and return to list</Link>
    </aside>
  </form>;
}
