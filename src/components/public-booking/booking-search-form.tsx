import { CheckCircle2, Info, Phone, XCircle } from "lucide-react";
import { BookingDateFields } from "./booking-date-fields";
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
  errors: serverErrors,
  formError,
  marinaName,
  contactPhone,
  marinaSlug,
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
  contactPhone?: string | null;
  marinaSlug: string;
  minArrivalDate: string;
  priceError?: string;
  priceQuote: PublicPriceQuote | null;
  holdIdempotencyKey: string;
  request: PublicBookingSearch | null;
  resultAttempt?: string;
  values: FormValues;
}) {
  // Presentation only: server validation continues to reject every invalid value.
  const errors = { ...serverErrors };
  for (const name of ["vesselLengthM", "vesselBeamM", "vesselDraftM"] as const) {
    if (errors[name]) errors[name] = values[name] ? "Use 0.01–9999.99 m." : "Enter a measurement.";
  }
  return (
    <SearchForm action={`/marina/${encodeURIComponent(marinaSlug)}#booking-entry`} resultAttempt={resultAttempt} reviewAvailable={Boolean(request && availability?.available)}>
      <section className={styles.searchSurface} aria-label="Dates and vessel">
        <h2 className="sr-only">Check availability at {marinaName}</h2>
        <div className={styles.dateGrid}>
          <BookingDateFields arrivalDate={values.arrivalDate} departureDate={values.departureDate} minDate={minArrivalDate} errors={errors} />
          <div className="form-field">
            <label htmlFor="public-vesselName">Vessel name <small>Optional</small></label>
            <input aria-describedby={describedBy(errors, "vesselName")} aria-invalid={Boolean(errors.vesselName)} defaultValue={values.vesselName} id="public-vesselName" maxLength={120} name="vesselName" />
            <FieldError id="public-vesselName-error" message={errors.vesselName} />
          </div>
        </div>
        <div className={styles.dimensionGrid}>
          {([ ["vesselLengthM", "Length"], ["vesselBeamM", "Beam"], ["vesselDraftM", "Draft"] ] as const).map(([name, label]) => (
            <div className="form-field" key={name}>
              <label htmlFor={`public-${name}`}>{label} <span className={styles.required} aria-hidden="true">*</span></label>
              <div className={styles.dimensionInput}><input aria-describedby={describedBy(errors, name)} aria-invalid={Boolean(errors[name])} defaultValue={values[name]} id={`public-${name}`} aria-label={label} inputMode="decimal" max="9999.99" min="0.01" name={name} required step="0.01" type="number" /><span aria-hidden="true">m</span></div>
              <FieldError id={`public-${name}-error`} message={errors[name]} />
            </div>
          ))}
          <AvailabilitySubmitButton className={`button ${availability?.available && priceQuote ? "button-secondary" : "button-primary"} ${styles.checkButton}`} />
        </div>
        <fieldset className={styles.etaSelection} aria-describedby="public-eta-help">
          <legend>Estimated arrival time (ETA) <span>Optional</span></legend>
          <div className={styles.etaChoices}>
            {([ ["unsure", "Not sure yet", ""], ["morning", "Morning", "06:00–12:00"], ["afternoon", "Afternoon", "12:00–18:00"], ["evening", "Evening", "18:00–24:00"] ] as const).map(([value, label, interval]) => (
              <label className={styles.etaChoice} key={value}>
                <input type="radio" name="etaWindow" value={value} defaultChecked={(values.etaWindow || "unsure") === value} />
                <span><strong>{label}</strong>{interval ? <small>{interval}</small> : null}</span>
              </label>
            ))}
          </div>
          <p id="public-eta-help"><Info size={15} aria-hidden="true" /> You can update your estimated arrival time later.</p>
          <FieldError id="public-etaWindow-error" message={errors.etaWindow} />
        </fieldset>
        {formError ? <p className="form-message form-error" role="alert">{formError}</p> : null}
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
          {availability.available && request.etaWindow ? <p className={styles.mobileOnly}>Arrival preference: {request.etaWindow}. Exact arrival time can be updated later.</p> : null}
          {contactPhone ? <p className={styles.contact}><Phone size={15} aria-hidden="true" /> Marina assistance: <a href={`tel:${contactPhone}`}>{contactPhone}</a></p> : null}
          {availability.available && priceQuote ? <HoldControl idempotencyKey={holdIdempotencyKey} marinaSlug={marinaSlug} online={acceptsOnlinePayment} atMarina={acceptsPayAtMarina} /> : null}
        </section>
      ) : null}
    </SearchForm>
  );
}
