"use client";

import { Info, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";
import { useFormStatus } from "react-dom";
import type { CancellationPolicyActionState } from "@/app/dashboard/settings/cancellation-policy/actions";
import type { CancellationPolicyInput } from "@/domain/cancellation-policy/types";
import { validateCancellationPolicyInput } from "@/domain/cancellation-policy/validation";
import { cancellationPolicy } from "@/domain/booking-cancellations/model";
import styles from "./cancellation-policy.module.css";

function windowLabel(min: number | null, max: number | null) {
  if (min === null && max === null) return "All cancellation dates";
  if (min === null) return `${max} ${max === 1 ? "day" : "days"} or fewer before arrival`;
  if (max === null) return `${min}+ days before arrival`;
  return `${min}–${max} days before arrival`;
}

const initialState: CancellationPolicyActionState = { status: "idle" };
type PolicyAction = (state: CancellationPolicyActionState, formData: FormData) => Promise<CancellationPolicyActionState>;
const subscribeToHydration = () => () => {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}

export function CancellationPolicyForm({
  action,
  initialPolicy,
  policyVersion,
}: {
  action: PolicyAction;
  initialPolicy: CancellationPolicyInput;
  policyVersion: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [editor, setEditor] = useState({ policy: initialPolicy, version: policyVersion });
  const activeVersion = state.updatedAt ?? policyVersion;
  const serverPolicy = state.policy ?? initialPolicy;
  const policy = editor.version === activeVersion ? editor.policy : serverPolicy;
  const setPolicy = (update: SetStateAction<CancellationPolicyInput>) => {
    setEditor((current) => {
      const currentPolicy = current.version === activeVersion ? current.policy : serverPolicy;
      return { policy: typeof update === "function" ? update(currentPolicy) : update, version: activeVersion };
    });
  };
  const serialized = useMemo(() => JSON.stringify(policy), [policy]);
  const [editingTier, setEditingTier] = useState<number | null>(null);
  const [arrivalDate, setArrivalDate] = useState("");
  const [cancellationDate, setCancellationDate] = useState("");
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const validation = validateCancellationPolicyInput(policy);
  const daysBeforeArrival = arrivalDate && cancellationDate
    ? Math.round((Date.parse(arrivalDate) - Date.parse(cancellationDate)) / 86400000)
    : null;
  const preview = validation.success && daysBeforeArrival !== null && Number.isFinite(daysBeforeArrival)
    ? cancellationPolicy(daysBeforeArrival, policy.tiers) : null;

  function addTier() {
    setEditingTier(policy.tiers.length);
    setPolicy((current) => {
      const finalTier = current.tiers.at(-1);
      const nextMinimum = finalTier?.minDaysBeforeArrival === null ? 0 : (finalTier?.minDaysBeforeArrival ?? -1) + 1;
      const previous = finalTier ? { ...finalTier, maxDaysBeforeArrival: nextMinimum - 1 } : null;
      return {
        ...current,
        tiers: [
          ...current.tiers.slice(0, -1),
          ...(previous ? [previous] : []),
          { policyCode: `refund_tier_${current.tiers.length + 1}`, minDaysBeforeArrival: nextMinimum, maxDaysBeforeArrival: null, refundPercent: finalTier?.refundPercent ?? 0 },
        ],
      };
    });
  }

  return (
    <form action={formAction} className="pricing-config-form" data-hydrated={hydrated ? "true" : "false"} key={activeVersion} noValidate>
      <input name="policy" type="hidden" value={serialized} />
      <section className="form-section" aria-labelledby="cancellation-rules-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2 id="cancellation-rules-heading">Policy Tiers</h2>
            <p>Ordered from the lowest to highest day range. Negative days are after arrival.</p>
          </div>
        </div>
        <div className="pricing-config-list">
          {policy.tiers.map((tier, index) => (
            <fieldset className="pricing-config-card" key={index}>
              <legend className="sr-only">Tier {index + 1}</legend>
              <div className={styles.tierRow}>
                <span className={styles.tierNumber}>{index + 1}</span>
                <div className={styles.tierDescription}><h3>{windowLabel(tier.minDaysBeforeArrival, tier.maxDaysBeforeArrival)}</h3><p>{tier.policyCode.replaceAll("_", " ")}</p></div>
                <div className={styles.refund}><strong>{tier.refundPercent}%</strong><span>Refund recommendation</span></div>
                <button className={styles.iconButton} type="button" aria-label={`Edit cancellation tier ${index + 1}`} aria-expanded={editingTier === index || !!state.fieldErrors?.tiers} aria-controls={`tier-editor-${index}`} onClick={() => setEditingTier(editingTier === index ? null : index)}><Pencil size={17} aria-hidden="true" /></button>
                <button aria-label={`Remove cancellation tier ${index + 1}`} className={styles.iconButton} disabled={policy.tiers.length === 1} type="button" onClick={() => { setEditingTier(null); setPolicy((current) => ({ ...current, tiers: current.tiers.filter((_, itemIndex) => itemIndex !== index) })); }}><Trash2 size={17} aria-hidden="true" /></button>
              </div>
              <div id={`tier-editor-${index}`} hidden={editingTier !== index && !state.fieldErrors?.tiers}>
              <div className="berth-form-grid berth-form-grid-four">
                <div className="form-field">
                  <label htmlFor={`policy-${index}-code`}>Policy code</label>
                  <input id={`policy-${index}-code`} maxLength={80} required value={tier.policyCode} onChange={(event) => setPolicy((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, policyCode: event.target.value } : item) }))} />
                </div>
                <div className="form-field">
                  <label htmlFor={`policy-${index}-min`}>Minimum days</label>
                  <input id={`policy-${index}-min`} disabled={index === 0} max={36500} min={-36500} placeholder="No minimum" step={1} type="number" value={tier.minDaysBeforeArrival ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, minDaysBeforeArrival: event.target.value === "" ? null : Number(event.target.value) } : item) }))} />
                </div>
                <div className="form-field">
                  <label htmlFor={`policy-${index}-max`}>Maximum days</label>
                  <input id={`policy-${index}-max`} disabled={index === policy.tiers.length - 1} max={36500} min={-36500} placeholder="No maximum" step={1} type="number" value={tier.maxDaysBeforeArrival ?? ""} onChange={(event) => setPolicy((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, maxDaysBeforeArrival: event.target.value === "" ? null : Number(event.target.value) } : item) }))} />
                </div>
                <div className="form-field">
                  <label htmlFor={`policy-${index}-percent`}>Refund percentage</label>
                  <input id={`policy-${index}-percent`} max={100} min={0} step={1} type="number" value={tier.refundPercent} onChange={(event) => setPolicy((current) => ({ ...current, tiers: current.tiers.map((item, itemIndex) => itemIndex === index ? { ...item, refundPercent: Number(event.target.value) } : item) }))} />
                </div>
              </div>
              </div>
            </fieldset>
          ))}
        </div>
        {state.fieldErrors?.tiers ? <p className="field-error pricing-config-error">{state.fieldErrors.tiers}</p> : null}
        <button className="button button-secondary pricing-add" disabled={policy.tiers.length >= 20} type="button" onClick={addTier}>
          <Plus size={15} aria-hidden="true" /> Add tier
        </button>
      </section>

      <section className="form-section" aria-labelledby="cancellation-coverage-heading">
        <div className="form-section-heading"><h2 id="cancellation-coverage-heading">Policy Coverage</h2><p>Cover every cancellation day without gaps or overlaps.</p></div>
        <div className={styles.coverage}>
          <p aria-live="polite">{validation.success ? "Complete coverage · No gaps or overlaps" : validation.errors.tiers ?? validation.errors.configuration}</p>
          <div className={`${styles.timeline} ${!validation.success ? styles.invalid : ""}`} aria-hidden="true">{policy.tiers.map((tier, index) => <span key={index}>{tier.refundPercent}%</span>)}</div>
          <p className={styles.coverageHelp}>Lowest to highest days before arrival · Segments are not to scale.</p>
        </div>
      </section>
      <section className="form-section" aria-labelledby="cancellation-preview-heading">
        <div className="form-section-heading"><h2 id="cancellation-preview-heading">Policy Preview</h2><p>Test the current tiers using whole calendar days before arrival.</p></div>
        <div className={styles.preview}>
          <div className="form-field"><label htmlFor="preview-arrival">Arrival date</label><input disabled={!hydrated} id="preview-arrival" type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} /></div>
          <div className="form-field"><label htmlFor="preview-cancellation">Cancellation date</label><input disabled={!hydrated} id="preview-cancellation" type="date" value={cancellationDate} onChange={(event) => setCancellationDate(event.target.value)} /></div>
          <div className={styles.previewResult} aria-live="polite"><span>Applicable refund</span><strong>{preview ? `${preview.refundPercent}%` : "—"}</strong><p>{!validation.success ? "Resolve the policy errors to preview." : preview ? `${daysBeforeArrival} days before arrival · ${preview.policyCode.replaceAll("_", " ")}` : "Choose both dates to preview."}</p></div>
        </div>
      </section>

      {state.fieldErrors?.configuration ? <p className="form-message form-error" role="alert">{state.fieldErrors.configuration}</p> : null}
      {state.message ? <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role={state.status === "success" ? "status" : "alert"}>{state.message}</p> : null}
      <div className={styles.note}><Info size={18} aria-hidden="true" /><div><strong>Important Note</strong><p>Changes apply to future cancellation evaluations, including existing bookings. The active policy is checked again when cancellation is confirmed. Existing booking price snapshots and recorded cancellation history remain unchanged. This policy recommends refunds; it does not issue them.</p></div></div>
      <div className="form-actions"><Link className="button button-quiet" href="/dashboard/settings">Cancel</Link><SubmitButton /></div>
    </form>
  );
}
