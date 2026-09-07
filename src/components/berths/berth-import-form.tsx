"use client";

import { AlertTriangle, Check, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { applyBerthImportAction, previewBerthImportAction } from "@/app/dashboard/berths/import/actions";
import type { BerthImportActionState } from "@/domain/berth-import/types";
import styles from "./berth-import.module.css";

const initialState: BerthImportActionState = { status: "idle" };

function SubmitButton({ idleLabel, pendingLabel, disabled = false, primary = false, accessibleLabel }: { idleLabel: string; pendingLabel: string; disabled?: boolean; primary?: boolean; accessibleLabel?: string }) {
  const { pending } = useFormStatus();
  return <button aria-label={accessibleLabel} className={`${styles.button} ${primary ? styles.primary : ""}`} disabled={pending || disabled} type="submit">
    {pending ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}{pending ? pendingLabel : idleLabel}
  </button>;
}

export function BerthImportForm() {
  const [previewState, previewAction] = useActionState(previewBerthImportAction, initialState);
  const [applyState, applyAction] = useActionState(applyBerthImportAction, initialState);
  const [filename, setFilename] = useState("");
  const preview = previewState.preview;
  const imported = applyState.status === "success";
  const ready = Boolean(previewState.payload && preview?.errorCount === 0);

  return <div className={styles.flow}>
    <ol className={styles.steps} aria-label="CSV import progress">
      <li className={preview ? styles.complete : styles.current} aria-current={!preview ? "step" : undefined}><span>{preview ? <Check size={13} aria-hidden="true" /> : "1"}</span><div><strong>Upload</strong><small>Select a CSV file</small></div></li>
      <li className={preview ? styles.complete : ""}><span>{preview ? <Check size={13} aria-hidden="true" /> : "2"}</span><div><strong>Preview &amp; Validate</strong><small>Review every row</small></div></li>
      <li className={imported ? styles.complete : preview ? styles.current : ""} aria-current={preview && !imported ? "step" : undefined}><span>{imported ? <Check size={13} aria-hidden="true" /> : "3"}</span><div><strong>Confirm</strong><small>Import all rows</small></div></li>
    </ol>

    <form action={previewAction} className={styles.uploadCard}>
      <div className={styles.uploadCopy}><span className={styles.uploadIcon}><Upload size={20} aria-hidden="true" /></span><div><h2>Upload CSV</h2><p>Select a berth inventory file to validate. Nothing is saved during preview.</p></div></div>
      <div className={styles.fileRow}>
        <label className={styles.fileButton} htmlFor="csvFile">Choose CSV File</label>
        <input accept=".csv,text/csv" aria-label="Berth inventory CSV" id="csvFile" name="csvFile" onChange={(event) => setFilename(event.target.files?.[0]?.name ?? "")} required type="file" />
        <div className={styles.filename}><FileSpreadsheet size={17} aria-hidden="true" /><span><strong>{filename || "No file selected"}</strong><small>CSV · Maximum 512 KB and 500 data rows</small></span></div>
        <SubmitButton accessibleLabel="Preview import" idleLabel={preview ? "Preview New CSV" : "Preview & Validate"} pendingLabel="Validating..." primary />
      </div>
      <div className={styles.uploadFooter}><p>Required: berth code, zone, dimensions, and status.</p><a download href="/berth-import-template.csv">Download Sample CSV Template</a></div>
      {previewState.status === "error" ? <p className={styles.errorMessage} role="alert"><AlertTriangle size={16} aria-hidden="true" />{previewState.message}</p> : null}
    </form>

    {preview && !imported ? <section className={styles.preview} aria-labelledby="import-preview-heading">
      <header className={styles.previewHeader}><div><h2 id="import-preview-heading">Preview &amp; Validate</h2><p>{filename || "Uploaded CSV"} · Review every row before import.</p></div><label className={styles.quietAction} htmlFor="csvFile">Choose Different File</label></header>
      <div className={styles.summary} aria-label="Import preview summary">
        <div><span>Total Rows</span><strong>{preview.rows.length}</strong></div><div><span>Valid Rows</span><strong>{preview.validCount}</strong></div><div className={preview.errorCount ? styles.blocked : ""}><span>Blocked Rows</span><strong>{preview.errorCount}</strong></div>
        <p className={ready ? styles.readyNote : styles.blockedNote}>{ready ? <Check size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}{previewState.message}</p>
      </div>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="CSV berth preview table">
        <table className={styles.table}><caption className={styles.srOnly}>All CSV berth rows and validation results</caption>
          <thead><tr><th>Row</th><th>Berth Code</th><th>Zone / Pier</th><th>Dimensions</th><th>Initial Status</th><th>Priority</th><th>Allow Smaller Vessels</th><th>Validation State</th></tr></thead>
          <tbody>{preview.rows.map((row) => <tr className={row.errors.length ? styles.invalidRow : ""} key={row.rowNumber}>
            <td>{row.rowNumber}</td><td><strong>{row.berth?.code ?? (row.rawCode || "Invalid")}</strong></td><td>{row.berth?.zone ?? (row.rawZone || "—")}</td>
            <td>{row.berth ? <span className={styles.dimensions}>L {row.berth.maxLengthM.toFixed(2)} m · B {row.berth.maxBeamM.toFixed(2)} m · D {row.berth.maxDraftM.toFixed(2)} m</span> : "—"}</td>
            <td>{row.berth ? row.berth.status.replaceAll("_", " ") : "—"}</td><td>{row.berth?.priority ?? "—"}</td><td>{row.berth ? row.berth.allowSmallerVessels ? "Yes" : "No" : "—"}</td>
            <td>{row.errors.length ? <div className={styles.rowErrors}><span><AlertTriangle size={13} aria-hidden="true" />Blocked</span><ul>{row.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : <span className={styles.valid}><Check size={13} aria-hidden="true" />Ready</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className={styles.actionBar}>
        <div><strong>Confirm Import</strong><p>{ready ? `All ${preview.validCount} rows will be inserted together.` : "Fix the CSV errors and upload the complete file again. Partial import is unavailable."}</p></div>
        <div className={styles.actions}><label className={styles.button} htmlFor="csvFile">Upload New CSV</label><form action={applyAction}><input name="payload" type="hidden" value={previewState.payload ?? ""} /><SubmitButton disabled={!ready} idleLabel={`Import ${preview.rows.length} Berths`} pendingLabel="Importing..." primary /></form></div>
      </div>
      {applyState.status === "error" ? <p className={styles.errorMessage} role="alert"><AlertTriangle size={16} aria-hidden="true" />{applyState.message}</p> : null}
    </section> : null}

    {imported ? <section className={styles.success} role="status"><span><Check size={20} aria-hidden="true" /></span><div><h2>Import Complete</h2><p>{applyState.message}</p></div><Link className={`${styles.button} ${styles.primary}`} href="/dashboard/berths">View Berth Inventory</Link></section> : null}
  </div>;
}
