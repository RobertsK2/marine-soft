import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Ruler,
  XCircle,
} from "lucide-react";
import type {
  BookingSearchField,
  BookingSearchFieldErrors,
  PublicBookingSearch,
} from "@/domain/public-booking/types";
import type { PublicAvailabilityResult } from "@/domain/public-availability/types";

type FormValues = Record<BookingSearchField, string>;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="field-error" id={id}>{message}</p> : null;
}

function describedBy(errors: BookingSearchFieldErrors, field: BookingSearchField) {
  return errors[field] ? `public-${field}-error` : undefined;
}

export function BookingSearchForm({
  availability,
  availabilityError,
  errors,
  formError,
  marinaName,
  marinaSlug,
  marinaTimezone,
  minArrivalDate,
  request,
  values,
}: {
  availability: PublicAvailabilityResult | null;
  availabilityError?: string;
  errors: BookingSearchFieldErrors;
  formError?: string;
  marinaName: string;
  marinaSlug: string;
  marinaTimezone: string;
  minArrivalDate: string;
  request: PublicBookingSearch | null;
  values: FormValues;
}) {
  return (
    <form
      action={`/marina/${encodeURIComponent(marinaSlug)}#booking-entry`}
      className="public-booking-form"
      method="get"
      noValidate
    >
      <div className="public-booking-form-heading">
        <p><CalendarDays size={15} /> Stay request</p>
        <h3>Dates and vessel</h3>
        <span>Times use {marinaName} local time: {marinaTimezone}.</span>
      </div>

      <fieldset>
        <legend><span>01</span> Stay window</legend>
        <p className="public-booking-helper">Departure is checkout and does not consume that night: [arrival, departure).</p>
        <div className="public-booking-grid public-booking-grid-four">
          {([
            ["arrivalDate", "Arrival date", "date"],
            ["departureDate", "Departure date", "date"],
            ["eta", "ETA", "time"],
            ["etd", "ETD", "time"],
          ] as const).map(([name, label, type]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`public-${name}`}>{label}</label>
              <input
                aria-describedby={describedBy(errors, name)}
                aria-invalid={Boolean(errors[name])}
                defaultValue={values[name]}
                id={`public-${name}`}
                min={type === "date" ? minArrivalDate : undefined}
                name={name}
                required
                type={type}
              />
              <FieldError id={`public-${name}-error`} message={errors[name]} />
            </div>
          ))}
        </div>
        <p className="public-booking-time-note"><Clock3 size={14} /> ETA and ETD are entered in {marinaTimezone}.</p>
      </fieldset>

      <fieldset>
        <legend><span>02</span> Vessel dimensions</legend>
        <p className="public-booking-helper">Enter maximum dimensions in metres. Vessel name is optional.</p>
        <div className="public-booking-grid public-booking-grid-four">
          <div className="form-field">
            <label htmlFor="public-vesselName">Vessel name <small>Optional</small></label>
            <input
              aria-describedby={describedBy(errors, "vesselName")}
              aria-invalid={Boolean(errors.vesselName)}
              defaultValue={values.vesselName}
              id="public-vesselName"
              maxLength={120}
              name="vesselName"
            />
            <FieldError id="public-vesselName-error" message={errors.vesselName} />
          </div>
          {([
            ["vesselLengthM", "Length"],
            ["vesselBeamM", "Beam"],
            ["vesselDraftM", "Draft"],
          ] as const).map(([name, label]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`public-${name}`}>{label} (m)</label>
              <div className="public-dimension-input">
                <input
                  aria-describedby={describedBy(errors, name)}
                  aria-invalid={Boolean(errors[name])}
                  defaultValue={values[name]}
                  id={`public-${name}`}
                  inputMode="decimal"
                  max="9999.99"
                  min="0.01"
                  name={name}
                  required
                  step="0.01"
                  type="number"
                />
                <Ruler aria-hidden="true" size={15} />
              </div>
              <FieldError id={`public-${name}-error`} message={errors[name]} />
            </div>
          ))}
        </div>
      </fieldset>

      {formError ? <p className="form-message form-error" role="alert">{formError}</p> : null}
      {availabilityError ? (
        <div className="public-availability-result public-availability-error" role="alert">
          <XCircle aria-hidden="true" size={22} />
          <div>
            <strong>Availability could not be checked</strong>
            <p>{availabilityError}</p>
          </div>
        </div>
      ) : null}
      {request && availability ? (
        <div
          className={`public-availability-result ${availability.available ? "public-availability-available" : "public-availability-unavailable"}`}
          data-availability={availability.available ? "available" : availability.reason}
          role="status"
        >
          {availability.available ? (
            <CheckCircle2 aria-hidden="true" size={22} />
          ) : (
            <XCircle aria-hidden="true" size={22} />
          )}
          <div>
            <strong>
              {availability.available
                ? "Available for these dates"
                : availability.reason === "no_suitable_berth"
                  ? "Unavailable — vessel does not fit"
                  : "Unavailable — suitable capacity is full"}
            </strong>
            <p>
              {availability.available
                ? "Compatible physical berth capacity is available for this stay."
                : availability.reason === "no_suitable_berth"
                  ? "The entered dimensions do not fit a currently bookable berth."
                  : "Compatible berth capacity is already committed during part of this stay."}
            </p>
            <span>{request.stayNights} {request.stayNights === 1 ? "night" : "nights"} · {request.vesselLengthM.toFixed(2)} × {request.vesselBeamM.toFixed(2)} × {request.vesselDraftM.toFixed(2)} m</span>
            <small>This is a live capacity check, not a berth assignment. No booking has been created.</small>
          </div>
        </div>
      ) : null}

      <button className="button button-primary button-large" type="submit">
        Check availability <ArrowRight aria-hidden="true" size={17} />
      </button>
    </form>
  );
}
