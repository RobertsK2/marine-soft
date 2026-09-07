"use client";

import { Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { BerthActionState } from "@/app/dashboard/berths/actions";
import { BERTH_STATUSES, type BerthField } from "@/domain/berths/types";
import { validateBerthInput } from "@/domain/berths/validation";
import { formatMetres } from "@/domain/berths/formatting";
import styles from "./add-berth.module.css";

const initialState: BerthActionState = { status: "idle" };
const STATUS_LABELS = { available: "Available", blocked: "Blocked", out_of_service: "Out of service" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className={styles.submit} disabled={pending} type="submit">
    {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
    {pending ? "Saving…" : "Add Berth"}
  </button>;
}

export function AddBerthForm({ action, marinaName }: {
  action: (state: BerthActionState, data: FormData) => Promise<BerthActionState>;
  marinaName: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [values, setValues] = useState({ code: "", zone: "", maxLengthM: "", maxBeamM: "", maxDraftM: "", status: "available", priority: "100", allowSmallerVessels: true });
  const validation = validateBerthInput(values);
  const update = (name: BerthField, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const error = (name: BerthField) => state.fieldErrors?.[name];
  const fieldError = (name: BerthField) => error(name) ? <p className={styles.error} id={`${name}-error`}>{error(name)}</p> : null;
  const dimension = (value: string) => value.trim() && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 9999.99 ? formatMetres(Number(value)) : "—";

  // Failed server actions must retain the controlled select and checkbox DOM values.
  return <form className={styles.form} action={formAction} onReset={(event) => event.preventDefault()} noValidate>
    <div className={styles.main}>
      <section className={styles.card} aria-labelledby="identity-heading">
        <div className={styles.sectionHeading}><h2 id="identity-heading">1. Berth Identity &amp; Location</h2></div>
        <div className={styles.twoColumns}>
          <div className={styles.field}><label htmlFor="code">Berth Code / Name <span>*</span></label>
            <input id="code" name="code" value={values.code} onChange={(event) => update("code", event.target.value)} maxLength={32} placeholder="e.g. B09" required aria-invalid={Boolean(error("code"))} aria-describedby={error("code") ? "code-error" : undefined} />{fieldError("code")}
          </div>
          <div className={styles.field}><label htmlFor="zone">Zone / Pier <span>*</span></label>
            <input id="zone" name="zone" value={values.zone} onChange={(event) => update("zone", event.target.value)} maxLength={80} placeholder="e.g. North Pier" required aria-invalid={Boolean(error("zone"))} aria-describedby={error("zone") ? "zone-error" : undefined} />{fieldError("zone")}
          </div>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="dimensions-heading">
        <div className={styles.sectionHeading}><h2 id="dimensions-heading">2. Maximum Dimensions &amp; Clearance</h2><span>Metres (m)</span></div>
        <div className={styles.threeColumns}>
          {([ ["maxLengthM", "Maximum Length"], ["maxBeamM", "Maximum Beam"], ["maxDraftM", "Maximum Draft"] ] as const).map(([name, label]) => <div className={styles.field} key={name}>
            <label htmlFor={name}>{label} <span>*</span></label>
            <div className={styles.unitInput}><input id={name} name={name} value={values[name]} onChange={(event) => update(name, event.target.value)} type="number" inputMode="decimal" min="0.01" max="9999.99" step="0.01" required aria-invalid={Boolean(error(name))} aria-describedby={`${name}-unit${error(name) ? ` ${name}-error` : ""}`} /><span id={`${name}-unit`}>m</span></div>
            {fieldError(name)}
          </div>)}
        </div>
        <label className={styles.policy} htmlFor="allowSmallerVessels"><input id="allowSmallerVessels" name="allowSmallerVessels" type="checkbox" checked={values.allowSmallerVessels} onChange={(event) => setValues((current) => ({ ...current, allowSmallerVessels: event.target.checked }))} /><span><strong>Allow Smaller Vessels</strong><small>Vessels below these maximum dimensions may be assigned here.</small></span></label>
      </section>
      <section className={styles.card} aria-labelledby="operations-heading">
        <div className={styles.sectionHeading}><h2 id="operations-heading">3. Status &amp; Allocation</h2></div>
        <div className={styles.twoColumns}>
          <div className={styles.field}><label htmlFor="status">Initial Status <span>*</span></label>
            <select id="status" name="status" value={values.status} onChange={(event) => update("status", event.target.value)} aria-invalid={Boolean(error("status"))} aria-describedby={error("status") ? "status-error" : undefined}>{BERTH_STATUSES.map((status) => <option value={status} key={status}>{STATUS_LABELS[status]}</option>)}</select>{fieldError("status")}
          </div>
          <div className={styles.field}><label htmlFor="priority">Assignment Priority <span>*</span></label>
            <input id="priority" name="priority" value={values.priority} onChange={(event) => update("priority", event.target.value)} type="number" min="1" max="32767" step="1" required aria-invalid={Boolean(error("priority"))} aria-describedby={`priority-help${error("priority") ? " priority-error" : ""}`} />
            <p className={styles.help} id="priority-help">Lower numbers are considered first.</p>{fieldError("priority")}
          </div>
        </div>
      </section>
    </div>
    <aside className={`${styles.card} ${styles.summary}`} aria-label="Berth Summary">
      <div className={styles.summaryHeading}><h2>Berth Summary</h2><span>{validation.success ? "Details complete" : "Enter details"}</span></div>
      <div className={styles.identity}><h3>{values.code.trim() ? `Berth ${values.code.trim().toUpperCase()}` : "New berth"}</h3><p>{values.zone.trim() || "Zone / Pier not entered"}</p></div>
      <dl>
        <div><dt>Max Dimensions</dt><dd>{dimension(values.maxLengthM)} × {dimension(values.maxBeamM)} × {dimension(values.maxDraftM)}</dd></div>
        <div><dt>Allocation Rule</dt><dd>{values.allowSmallerVessels ? "Smaller vessels allowed" : "Exact class only"}</dd></div>
        <div><dt>Initial Status</dt><dd className={styles[values.status]}>{STATUS_LABELS[values.status as keyof typeof STATUS_LABELS]}</dd></div>
        <div><dt>Priority</dt><dd>{values.priority || "—"}</dd></div>
        <div><dt>Target Marina</dt><dd>{marinaName}</dd></div>
      </dl>
      <div className={styles.next}><h3>What happens next</h3><p>{values.status === "available" ? "The berth will be added to inventory and can be assigned to suitable vessels." : "The berth will be added to inventory. It must be available before vessels can be assigned."}</p></div>
      <div className={styles.cta}>
        {state.message ? <p className={styles.error} role="alert">{state.message}</p> : null}
        <SubmitButton />
        <Link className={styles.cancel} href="/dashboard/berths">Cancel</Link>
      </div>
    </aside>
  </form>;
}
