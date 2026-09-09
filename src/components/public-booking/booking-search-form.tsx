import { CheckCircle2, XCircle } from "lucide-react";
import { AvailabilitySubmitButton, SearchForm } from "./search-form";
import styles from "./guest-booking.module.css";
import type {
  BookingSearchField,
  BookingSearchFieldErrors,
  PublicBookingSearch,
} from "@/domain/public-booking/types";
import type { PublicAvailabilityResult } from "@/domain/public-availability/types";
import { PriceQuote } from "@/components/public-booking/price-quote";
import type { PublicPriceQuote } from "@/domain/pricing/types";
import { HoldControl } from "@/components/public-booking/hold-control";

type FormValues = Record<BookingSearchField, string>;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="field-error" id={id}>{message}</p> : null;
}

function describedBy(errors: BookingSearchFieldErrors, field: BookingSearchField) {
  return errors[field] ? `public-${field}-error` : undefined;
}

export function BookingSearchForm({
  availability,
  acceptsOnlinePayment,
  acceptsPayAtMarina,
  availabilityError,
  errors,
  formError,
  marinaName,
  marinaSlug,
  marinaTimezone,
  minArrivalDate,
  priceError,
  priceQuote,
  holdIdempotencyKey,
  request,
  resultAttempt,
  values,
}: {
  availability: PublicAvailabilityResult | null;
  acceptsOnlinePayment: boolean;
  acceptsPayAtMarina: boolean;
  availabilityError?: string;
  errors: BookingSearchFieldErrors;
  formError?: string;
  marinaName: string;
  marinaSlug: string;
  marinaTimezone: string;
  minArrivalDate: string;
  priceError?: string;
  priceQuote: PublicPriceQuote | null;
  holdIdempotencyKey: string;
  request: PublicBookingSearch | null;
  resultAttempt?: string;
  values: FormValues;
}) {
  return (
    <SearchForm action={`/marina/${encodeURIComponent(marinaSlug)}#booking-entry`} resultAttempt={resultAttempt} reviewAvailable={Boolean(request && availability?.available)}>
      <section className={styles.searchSurface} aria-label="Dates and vessel">
        <h2 className="sr-only">Check availability at {marinaName}</h2>
        <div className={styles.dateGrid}>
          {([ ["arrivalDate", "Arrival date"], ["departureDate", "Departure date"] ] as const).map(([name, label]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`public-${name}`}>{label}</label>
              <input aria-describedby={describedBy(errors, name)} aria-invalid={Boolean(errors[name])} defaultValue={values[name]} id={`public-${name}`} min={minArrivalDate} name={name} required type="date" />
              <FieldError id={`public-${name}-error`} message={errors[name]} />
            </div>
          ))}
          <div className="form-field">
            <label htmlFor="public-vesselName">Vessel name <small>Optional</small></label>
            <input aria-describedby={describedBy(errors, "vesselName")} aria-invalid={Boolean(errors.vesselName)} defaultValue={values.vesselName} id="public-vesselName" maxLength={120} name="vesselName" />
            <FieldError id="public-vesselName-error" message={errors.vesselName} />
          </div>
        </div>
        <div className={styles.dimensionGrid}>
          {([ ["vesselLengthM", "Length Overall (LOA)"], ["vesselBeamM", "Beam (Width)"], ["vesselDraftM", "Draft (Depth)"] ] as const).map(([name, label]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`public-${name}`}>{label}</label>
              <div className={styles.dimensionInput}><input aria-describedby={describedBy(errors, name)} aria-invalid={Boolean(errors[name])} defaultValue={values[name]} id={`public-${name}`} inputMode="decimal" max="9999.99" min="0.01" name={name} required step="0.01" type="number" /><span aria-hidden="true">m</span></div>
              <FieldError id={`public-${name}-error`} message={errors[name]} />
            </div>
          ))}
          <AvailabilitySubmitButton className={`button ${availability?.available && priceQuote ? "button-secondary" : "button-primary"} ${styles.checkButton}`} />
        </div>
        <div className={styles.timeGrid}>
          {([ ["eta", "ETA"], ["etd", "ETD"] ] as const).map(([name, label]) => (
            <div className="form-field" key={name}><label htmlFor={`public-${name}`}>{label} <small>{name === "eta" ? "Arrival time" : "Departure time"}</small></label><input aria-describedby={describedBy(errors, name)} aria-invalid={Boolean(errors[name])} defaultValue={values[name]} id={`public-${name}`} name={name} required type="time" /><FieldError id={`public-${name}-error`} message={errors[name]} /></div>
          ))}
          <p>Times are local to the marina.<br />{marinaTimezone}</p>
        </div>
        {formError ? <p className="form-message form-error" role="alert">{formError}</p> : null}
        {errors.eta || errors.etd ? <p className={styles.mobileOnly} role="alert">Arrival or departure time is invalid. Check availability again to use estimated times.</p> : null}
      </section>
      {availabilityError ? <div className={styles.result} role="alert"><h2>Availability could not be checked</h2><p>{availabilityError}</p></div> : null}
      {request && availability ? (
        <section className={styles.result} data-availability={availability.available ? "available" : availability.reason}>
          <div role="status">
            {availability.available && request.vesselName ? <p className={styles.mobileOnly}><strong>{request.vesselName}</strong></p> : null}
            {availability.available ? <span className={styles.available}><CheckCircle2 size={14} aria-hidden="true" /> Suitable berth available</span> : <XCircle size={20} aria-hidden="true" />}
            <h2>{availability.available ? "Suitable berth capacity" : availability.reason === "no_suitable_berth" ? "Unavailable — vessel does not fit" : "Unavailable — suitable capacity is full"}</h2>
            <p>{availability.available ? `Fits your vessel: ${request.vesselLengthM.toFixed(2)} m LOA × ${request.vesselBeamM.toFixed(2)} m beam × ${request.vesselDraftM.toFixed(2)} m draft.` : availability.reason === "no_suitable_berth" ? "The entered dimensions do not fit a currently bookable berth." : "Compatible berth capacity is already committed during part of this stay."}</p>
            <p>{request.arrivalDate} – {request.departureDate} · {request.stayNights} {request.stayNights === 1 ? "night" : "nights"}</p>
            <small>No booking has been created. The marina assigns your berth.</small>
          </div>
          {availability.available ? <PriceQuote error={priceError} quote={priceQuote} paymentRequired={!acceptsPayAtMarina} /> : null}
          {availability.available ? <p className={styles.mobileOnly}>Estimated arrival {request.eta}, departure {request.etd}. Times are local to {marinaTimezone}.</p> : null}
          {availability.available && priceQuote ? <HoldControl idempotencyKey={holdIdempotencyKey} marinaSlug={marinaSlug} online={acceptsOnlinePayment} atMarina={acceptsPayAtMarina} /> : null}
        </section>
      ) : null}
    </SearchForm>
  );
}
