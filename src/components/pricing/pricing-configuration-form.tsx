"use client";

import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState, type SetStateAction } from "react";
import { useFormStatus } from "react-dom";
import type { PricingConfigurationActionState } from "@/app/dashboard/settings/pricing/actions";
import type {
  MandatoryFee,
  PricingConfigurationInput,
  PricingModel,
} from "@/domain/pricing/types";

const initialState: PricingConfigurationActionState = { status: "idle" };

type PricingAction = (
  state: PricingConfigurationActionState,
  formData: FormData,
) => Promise<PricingConfigurationActionState>;

const newSeason = (model: PricingModel) => ({
  name: "",
  startsOn: "",
  endsOn: "",
  meterRateMinor: model === "per_meter" ? 0 : null,
  lengthRates: model === "length_interval" ? [{ minLengthM: 0, maxLengthM: 20, nightlyRateMinor: 0 }] : [],
});

const newFee = (): MandatoryFee => ({
  name: "",
  type: "per_booking",
  amountMinor: 0,
  percentageBps: null,
});

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Saving..." : "Save pricing configuration"}
    </button>
  );
}

export function PricingConfigurationForm({
  action,
  configurationVersion,
  initialConfiguration,
}: {
  action: PricingAction;
  configurationVersion: string;
  initialConfiguration: PricingConfigurationInput;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [editor, setEditor] = useState({
    configuration: initialConfiguration,
    version: configurationVersion,
  });
  const activeVersion = state.updatedAt ?? configurationVersion;
  const serverConfiguration = state.configuration ?? initialConfiguration;
  const configuration = editor.version === activeVersion
    ? editor.configuration
    : serverConfiguration;
  const setConfiguration = (update: SetStateAction<PricingConfigurationInput>) => {
    setEditor((current) => {
      const currentConfiguration = current.version === activeVersion
        ? current.configuration
        : serverConfiguration;
      return {
        configuration: typeof update === "function" ? update(currentConfiguration) : update,
        version: activeVersion,
      };
    });
  };
  const serialized = useMemo(() => JSON.stringify(configuration), [configuration]);

  function setModel(model: PricingModel) {
    setConfiguration((current) => ({
      ...current,
      model,
      seasons: current.seasons.map((season) => ({
        ...season,
        meterRateMinor: model === "per_meter" ? (season.meterRateMinor ?? 0) : null,
        lengthRates: model === "length_interval"
          ? (season.lengthRates.length ? season.lengthRates : [{ minLengthM: 0, maxLengthM: 20, nightlyRateMinor: 0 }])
          : [],
      })),
    }));
  }

  return (
    <form action={formAction} className="pricing-config-form" key={activeVersion} noValidate>
      <input name="configuration" type="hidden" value={serialized} />

      <section className="form-section" aria-labelledby="pricing-base-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2 id="pricing-base-heading">Base berth pricing</h2>
            <p>Currency, rate model, and VAT/tax treatment used by the existing server quote engine.</p>
          </div>
        </div>
        <div className="berth-form-grid berth-form-grid-two">
          <div className="form-field">
            <label htmlFor="pricing-currency">Currency</label>
            <input id="pricing-currency" maxLength={3} required value={configuration.currency} onChange={(event) => setConfiguration({ ...configuration, currency: event.target.value.toUpperCase() })} />
            {state.fieldErrors?.currency ? <p className="field-error">{state.fieldErrors.currency}</p> : null}
          </div>
          <div className="form-field">
            <label htmlFor="pricing-model">Pricing model</label>
            <select id="pricing-model" value={configuration.model} onChange={(event) => setModel(event.target.value as PricingModel)}>
              <option value="per_meter">Per meter / night</option>
              <option value="length_interval">Fixed by vessel-length interval / night</option>
            </select>
            {state.fieldErrors?.model ? <p className="field-error">{state.fieldErrors.model}</p> : null}
          </div>
          <div className="form-field">
            <label htmlFor="pricing-tax-behavior">VAT / tax mode</label>
            <select id="pricing-tax-behavior" value={configuration.taxBehavior} onChange={(event) => setConfiguration({ ...configuration, taxBehavior: event.target.value as PricingConfigurationInput["taxBehavior"] })}>
              <option value="exclusive">Exclusive — added to configured prices</option>
              <option value="inclusive">Inclusive — contained in configured prices</option>
            </select>
            {state.fieldErrors?.taxBehavior ? <p className="field-error">{state.fieldErrors.taxBehavior}</p> : null}
          </div>
          <div className="form-field">
            <label htmlFor="pricing-tax-rate">VAT / tax basis points</label>
            <input id="pricing-tax-rate" inputMode="numeric" min={0} max={10000} step={1} type="number" value={configuration.taxRateBps} onChange={(event) => setConfiguration({ ...configuration, taxRateBps: Number(event.target.value) })} />
            <p className="field-help">2100 = 21.00%. Monetary prices are entered in minor units (for EUR, cents).</p>
            {state.fieldErrors?.taxRateBps ? <p className="field-error">{state.fieldErrors.taxRateBps}</p> : null}
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby="pricing-seasons-heading">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2 id="pricing-seasons-heading">Seasonal nightly rates</h2>
            <p>Date ranges use an inclusive start and exclusive end. Ranges may touch but cannot overlap.</p>
          </div>
        </div>
        <div className="pricing-config-list">
          {configuration.seasons.map((season, seasonIndex) => (
            <fieldset className="pricing-config-card" key={seasonIndex}>
              <legend>Season {seasonIndex + 1}</legend>
              <div className="berth-form-grid berth-form-grid-three">
                <div className="form-field"><label htmlFor={`season-${seasonIndex}-name`}>Name</label><input id={`season-${seasonIndex}-name`} maxLength={80} required value={season.name} onChange={(event) => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, name: event.target.value } : item) }))} /></div>
                <div className="form-field"><label htmlFor={`season-${seasonIndex}-starts`}>Starts on</label><input id={`season-${seasonIndex}-starts`} required type="date" value={season.startsOn} onChange={(event) => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, startsOn: event.target.value } : item) }))} /></div>
                <div className="form-field"><label htmlFor={`season-${seasonIndex}-ends`}>Ends on (exclusive)</label><input id={`season-${seasonIndex}-ends`} required type="date" value={season.endsOn} onChange={(event) => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, endsOn: event.target.value } : item) }))} /></div>
              </div>
              {configuration.model === "per_meter" ? (
                <div className="form-field pricing-rate-field"><label htmlFor={`season-${seasonIndex}-meter-rate`}>Nightly rate per meter / minor units</label><input id={`season-${seasonIndex}-meter-rate`} min={0} step={1} type="number" value={season.meterRateMinor ?? 0} onChange={(event) => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, meterRateMinor: Number(event.target.value) } : item) }))} /></div>
              ) : (
                <div className="pricing-length-rates">
                  {season.lengthRates.map((rate, rateIndex) => (
                    <div className="pricing-length-row" key={rateIndex}>
                      <div className="form-field"><label htmlFor={`season-${seasonIndex}-rate-${rateIndex}-min`}>Min length (m)</label><input id={`season-${seasonIndex}-rate-${rateIndex}-min`} min={0} step="0.01" type="number" value={rate.minLengthM} onChange={(event) => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, lengthRates: item.lengthRates.map((entry, entryIndex) => entryIndex === rateIndex ? { ...entry, minLengthM: Number(event.target.value) } : entry) } : item) }))} /></div>
                      <div className="form-field"><label htmlFor={`season-${seasonIndex}-rate-${rateIndex}-max`}>Max length (m, exclusive)</label><input id={`season-${seasonIndex}-rate-${rateIndex}-max`} min={0.01} step="0.01" type="number" value={rate.maxLengthM} onChange={(event) => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, lengthRates: item.lengthRates.map((entry, entryIndex) => entryIndex === rateIndex ? { ...entry, maxLengthM: Number(event.target.value) } : entry) } : item) }))} /></div>
                      <div className="form-field"><label htmlFor={`season-${seasonIndex}-rate-${rateIndex}-price`}>Nightly price / minor units</label><input id={`season-${seasonIndex}-rate-${rateIndex}-price`} min={0} step={1} type="number" value={rate.nightlyRateMinor} onChange={(event) => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, lengthRates: item.lengthRates.map((entry, entryIndex) => entryIndex === rateIndex ? { ...entry, nightlyRateMinor: Number(event.target.value) } : entry) } : item) }))} /></div>
                      <button aria-label={`Remove length rate ${rateIndex + 1} from season ${seasonIndex + 1}`} className="button button-quiet pricing-remove" disabled={season.lengthRates.length === 1} type="button" onClick={() => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, lengthRates: item.lengthRates.filter((_, entryIndex) => entryIndex !== rateIndex) } : item) }))}><Trash2 size={15} aria-hidden="true" /> Remove</button>
                    </div>
                  ))}
                  <button className="button button-secondary" type="button" onClick={() => setConfiguration((current) => ({ ...current, seasons: current.seasons.map((item, index) => index === seasonIndex ? { ...item, lengthRates: [...item.lengthRates, { minLengthM: item.lengthRates.at(-1)?.maxLengthM ?? 0, maxLengthM: (item.lengthRates.at(-1)?.maxLengthM ?? 0) + 10, nightlyRateMinor: 0 }] } : item) }))}><Plus size={15} aria-hidden="true" /> Add length interval</button>
                </div>
              )}
              <button className="button button-quiet pricing-remove" disabled={configuration.seasons.length === 1} type="button" onClick={() => setConfiguration((current) => ({ ...current, seasons: current.seasons.filter((_, index) => index !== seasonIndex) }))}><Trash2 size={15} aria-hidden="true" /> Remove season</button>
            </fieldset>
          ))}
        </div>
        {state.fieldErrors?.seasons ? <p className="field-error pricing-config-error">{state.fieldErrors.seasons}</p> : null}
        <button className="button button-secondary pricing-add" type="button" onClick={() => setConfiguration((current) => ({ ...current, seasons: [...current.seasons, newSeason(current.model)] }))}><Plus size={15} aria-hidden="true" /> Add season</button>
      </section>

      <section className="form-section" aria-labelledby="pricing-fees-heading">
        <div className="form-section-heading">
          <span>03</span>
          <div><h2 id="pricing-fees-heading">Mandatory fees</h2><p>All listed fees are included by the existing quote engine.</p></div>
        </div>
        <div className="pricing-config-list">
          {configuration.fees.map((fee, feeIndex) => (
            <div className="pricing-fee-row" key={feeIndex}>
              <div className="form-field"><label htmlFor={`fee-${feeIndex}-name`}>Fee name</label><input id={`fee-${feeIndex}-name`} maxLength={80} required value={fee.name} onChange={(event) => setConfiguration((current) => ({ ...current, fees: current.fees.map((item, index) => index === feeIndex ? { ...item, name: event.target.value } : item) }))} /></div>
              <div className="form-field"><label htmlFor={`fee-${feeIndex}-type`}>Fee type</label><select id={`fee-${feeIndex}-type`} value={fee.type} onChange={(event) => setConfiguration((current) => ({ ...current, fees: current.fees.map((item, index) => index === feeIndex ? { ...item, type: event.target.value as MandatoryFee["type"], amountMinor: event.target.value === "percentage" ? null : (item.amountMinor ?? 0), percentageBps: event.target.value === "percentage" ? (item.percentageBps ?? 1) : null } : item) }))}><option value="per_booking">Per booking</option><option value="per_night">Per night</option><option value="per_vessel">Per vessel</option><option value="percentage">Percentage of accommodation</option></select></div>
              <div className="form-field"><label htmlFor={`fee-${feeIndex}-value`}>{fee.type === "percentage" ? "Basis points" : "Amount / minor units"}</label><input id={`fee-${feeIndex}-value`} min={fee.type === "percentage" ? 1 : 0} max={fee.type === "percentage" ? 10000 : undefined} step={1} type="number" value={fee.type === "percentage" ? (fee.percentageBps ?? 1) : (fee.amountMinor ?? 0)} onChange={(event) => setConfiguration((current) => ({ ...current, fees: current.fees.map((item, index) => index === feeIndex ? item.type === "percentage" ? { ...item, percentageBps: Number(event.target.value) } : { ...item, amountMinor: Number(event.target.value) } : item) }))} /></div>
              <button aria-label={`Remove mandatory fee ${feeIndex + 1}`} className="button button-quiet pricing-remove" type="button" onClick={() => setConfiguration((current) => ({ ...current, fees: current.fees.filter((_, index) => index !== feeIndex) }))}><Trash2 size={15} aria-hidden="true" /> Remove</button>
            </div>
          ))}
          {configuration.fees.length === 0 ? <p className="map-readonly-note">No mandatory fees configured.</p> : null}
        </div>
        {state.fieldErrors?.fees ? <p className="field-error pricing-config-error">{state.fieldErrors.fees}</p> : null}
        <button className="button button-secondary pricing-add" type="button" onClick={() => setConfiguration((current) => ({ ...current, fees: [...current.fees, newFee()] }))}><Plus size={15} aria-hidden="true" /> Add mandatory fee</button>
      </section>

      {state.fieldErrors?.configuration ? <p className="form-message form-error" role="alert">{state.fieldErrors.configuration}</p> : null}
      {state.message ? <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role={state.status === "success" ? "status" : "alert"}>{state.message}</p> : null}
      <p className="pricing-snapshot-note">Saved changes apply to new server calculations. Existing booking price snapshots remain immutable.</p>
      <div className="form-actions"><SubmitButton /></div>
    </form>
  );
}
