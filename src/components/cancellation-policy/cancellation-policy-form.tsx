"use client";

import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState, type SetStateAction } from "react";
import { useFormStatus } from "react-dom";
import type { CancellationPolicyActionState } from "@/app/dashboard/settings/cancellation-policy/actions";
import type { CancellationPolicyInput } from "@/domain/cancellation-policy/types";

const initialState: CancellationPolicyActionState = { status: "idle" };
type PolicyAction = (state: CancellationPolicyActionState, formData: FormData) => Promise<CancellationPolicyActionState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Saving..." : "Save cancellation policy"}
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

  function addTier() {
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
    <form action={formAction} className="pricing-config-form" key={activeVersion} noValidate>
      <input name="policy" type="hidden" value={serialized} />
      <section className="form-section" aria-labelledby="cancellation-rules-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2 id="cancellation-rules-heading">Refund recommendation tiers</h2>
            <p>Order tiers from the lowest day range to the highest. Blank outer limits cover all earlier or later dates.</p>
          </div>
        </div>
        <div className="pricing-config-list">
          {policy.tiers.map((tier, index) => (
            <fieldset className="pricing-config-card" key={index}>
              <legend>Tier {index + 1}</legend>
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
              <button aria-label={`Remove cancellation tier ${index + 1}`} className="button button-quiet pricing-remove" disabled={policy.tiers.length === 1} type="button" onClick={() => setPolicy((current) => ({ ...current, tiers: current.tiers.filter((_, itemIndex) => itemIndex !== index) }))}>
                <Trash2 size={15} aria-hidden="true" /> Remove tier
              </button>
            </fieldset>
          ))}
        </div>
        {state.fieldErrors?.tiers ? <p className="field-error pricing-config-error">{state.fieldErrors.tiers}</p> : null}
        <button className="button button-secondary pricing-add" disabled={policy.tiers.length >= 20} type="button" onClick={addTier}>
          <Plus size={15} aria-hidden="true" /> Add tier
        </button>
      </section>

      <section className="form-section" aria-labelledby="cancellation-evaluation-heading">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2 id="cancellation-evaluation-heading">Evaluation and financial safety</h2>
            <p>The active marina policy is evaluated during each preview and again when cancellation is confirmed.</p>
          </div>
        </div>
        <p className="map-readonly-note">This policy recommends an amount only. It never issues a Stripe refund, edits payment history, or changes an existing booking price snapshot. The applied tier is stored with confirmed cancellation history.</p>
      </section>

      {state.fieldErrors?.configuration ? <p className="form-message form-error" role="alert">{state.fieldErrors.configuration}</p> : null}
      {state.message ? <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role={state.status === "success" ? "status" : "alert"}>{state.message}</p> : null}
      <div className="form-actions"><SubmitButton /></div>
    </form>
  );
}
