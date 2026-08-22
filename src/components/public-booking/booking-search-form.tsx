import { ArrowRight, CalendarDays, Clock3, Ruler } from "lucide-react";
import type {
  BookingSearchField,
  BookingSearchFieldErrors,
  PublicBookingSearch,
} from "@/domain/public-booking/types";

type FormValues = Record<BookingSearchField, string>;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="field-error" id={id}>{message}</p> : null;
}

function describedBy(errors: BookingSearchFieldErrors, field: BookingSearchField) {
  return errors[field] ? `public-${field}-error` : undefined;
}

export function BookingSearchForm({
  errors,
  formError,
  marinaName,
  marinaSlug,
  marinaTimezone,
  minArrivalDate,
  request,
  values,
}: {
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
      {request ? (
        <div className="public-booking-ready" data-search-ready="true" role="status">
          <strong>Search request validated</strong>
          <span>{request.stayNights} {request.stayNights === 1 ? "night" : "nights"} · {request.vesselLengthM.toFixed(2)} × {request.vesselBeamM.toFixed(2)} × {request.vesselDraftM.toFixed(2)} m</span>
          <small>Your entries remain in this URL for the availability step. No booking has been created.</small>
        </div>
      ) : null}

      <button className="button button-primary button-large" type="submit">
        Check availability <ArrowRight aria-hidden="true" size={17} />
      </button>
    </form>
  );
}
