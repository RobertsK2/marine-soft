"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BerthActionState } from "@/app/dashboard/berths/actions";
import { BERTH_STATUSES, type Berth } from "@/domain/berths/types";

const initialState: BerthActionState = { status: "idle" };

type BerthFormAction = (
  state: BerthActionState,
  formData: FormData,
) => Promise<BerthActionState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Saving..." : label}
    </button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="field-error" id={id}>
      {message}
    </p>
  ) : null;
}

export function BerthForm({
  action,
  berth,
  cancelHref,
}: {
  action: BerthFormAction;
  berth?: Berth;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="berth-form" noValidate>
      <section className="form-section" aria-labelledby="identity-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2 id="identity-heading">Berth identity</h2>
            <p>Use the physical code and operating zone shown at the marina.</p>
          </div>
        </div>
        <div className="berth-form-grid berth-form-grid-two">
          <div className="form-field">
            <label htmlFor="code">Berth code</label>
            <input
              aria-describedby={state.fieldErrors?.code ? "code-error" : undefined}
              aria-invalid={Boolean(state.fieldErrors?.code)}
              defaultValue={berth?.code}
              id="code"
              maxLength={32}
              name="code"
              placeholder="A-01"
              required
            />
            <FieldError id="code-error" message={state.fieldErrors?.code} />
          </div>
          <div className="form-field">
            <label htmlFor="zone">Zone</label>
            <input
              aria-describedby={state.fieldErrors?.zone ? "zone-error" : undefined}
              aria-invalid={Boolean(state.fieldErrors?.zone)}
              defaultValue={berth?.zone}
              id="zone"
              maxLength={80}
              name="zone"
              placeholder="North Pier"
              required
            />
            <FieldError id="zone-error" message={state.fieldErrors?.zone} />
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby="dimensions-heading">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2 id="dimensions-heading">Maximum vessel dimensions</h2>
            <p>Enter physical safety limits in metres. All values must be positive.</p>
          </div>
        </div>
        <div className="berth-form-grid berth-form-grid-three">
          {([
            ["maxLengthM", "Maximum length", berth?.max_length_m],
            ["maxBeamM", "Maximum beam", berth?.max_beam_m],
            ["maxDraftM", "Maximum draft", berth?.max_draft_m],
          ] as const).map(([name, label, defaultValue]) => {
            const field = name as "maxLengthM" | "maxBeamM" | "maxDraftM";
            const error = state.fieldErrors?.[field];
            return (
              <div className="form-field" key={name}>
                <label htmlFor={name}>{label} (m)</label>
                <input
                  aria-describedby={error ? `${name}-error` : undefined}
                  aria-invalid={Boolean(error)}
                  defaultValue={defaultValue}
                  id={name}
                  inputMode="decimal"
                  min="0.01"
                  name={name}
                  required
                  step="0.01"
                  type="number"
                />
                <FieldError id={`${name}-error`} message={error} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="form-section" aria-labelledby="operations-heading">
        <div className="form-section-heading">
          <span>03</span>
          <div>
            <h2 id="operations-heading">Operational rules</h2>
            <p>Lower priority numbers will be considered first by later matching logic.</p>
          </div>
        </div>
        <div className="berth-form-grid berth-form-grid-two">
          <div className="form-field">
            <label htmlFor="status">Status</label>
            <select
              aria-describedby={state.fieldErrors?.status ? "status-error" : undefined}
              aria-invalid={Boolean(state.fieldErrors?.status)}
              defaultValue={berth?.status ?? "available"}
              id="status"
              name="status"
            >
              {BERTH_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <FieldError id="status-error" message={state.fieldErrors?.status} />
          </div>
          <div className="form-field">
            <label htmlFor="priority">Priority</label>
            <input
              aria-describedby={state.fieldErrors?.priority ? "priority-error" : "priority-help"}
              aria-invalid={Boolean(state.fieldErrors?.priority)}
              defaultValue={berth?.priority ?? 100}
              id="priority"
              max="32767"
              min="1"
              name="priority"
              required
              step="1"
              type="number"
            />
            <p className="field-help" id="priority-help">1 is considered before 2.</p>
            <FieldError id="priority-error" message={state.fieldErrors?.priority} />
          </div>
        </div>
        <label className="checkbox-field" htmlFor="allowSmallerVessels">
          <input
            defaultChecked={berth?.allow_smaller_vessels ?? true}
            id="allowSmallerVessels"
            name="allowSmallerVessels"
            type="checkbox"
          />
          <span>
            <strong>Allow smaller vessels</strong>
            A vessel below this berth&apos;s maximum dimensions may be assigned here later.
          </span>
        </label>
      </section>

      {state.message ? <p className="form-message form-error" role="alert">{state.message}</p> : null}
      {state.status === "impact" && state.impact ? (
        <div className="berth-impact-warning" role="alert">
          <strong>Operational conflict — {state.impact.affectedCount} booking{state.impact.affectedCount === 1 ? "" : "s"}</strong>
          <p>{state.message}</p>
          <ul>
            {state.impact.affectedBookings.map((booking) => (
              <li key={booking.bookingId}>
                <Link href={`/dashboard/bookings/${booking.bookingId}`}>{booking.reference}</Link>
                <span>{booking.arrivalDate} → {booking.departureDate}</span>
                <small>{booking.berthOptions.length > 0 ? `${booking.berthOptions.length} valid alternative${booking.berthOptions.length === 1 ? "" : "s"}` : "No valid alternative"}</small>
              </li>
            ))}
          </ul>
          <input name="confirmImpact" type="hidden" value="true" />
          <button className="button button-secondary" type="submit">Confirm outage, leave bookings unresolved</button>
        </div>
      ) : null}

      <div className="form-actions">
        <SubmitButton label={berth ? "Save berth" : "Create berth"} />
        <Link className="button button-secondary" href={cancelHref}>Cancel</Link>
      </div>
    </form>
  );
}
