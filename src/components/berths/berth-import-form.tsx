"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  applyBerthImportAction,
  previewBerthImportAction,
} from "@/app/dashboard/berths/import/actions";
import type { BerthImportActionState } from "@/domain/berth-import/types";

const initialState: BerthImportActionState = { status: "idle" };

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function BerthImportForm() {
  const [previewState, previewAction] = useActionState(previewBerthImportAction, initialState);
  const [applyState, applyAction] = useActionState(applyBerthImportAction, initialState);
  const preview = previewState.preview;
  const imported = applyState.status === "success";

  return (
    <div className="berth-import-flow">
      <form action={previewAction} className="form-section berth-import-upload">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2>Upload and validate</h2>
            <p>Nothing is saved while Berthio parses and previews the file.</p>
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="csvFile">Berth inventory CSV</label>
          <input accept=".csv,text/csv" id="csvFile" name="csvFile" required type="file" />
          <p className="field-help">
            Up to 500 data rows and 512 KB. Use <code>berth_code</code>, <code>zone</code>, dimensions, and status.
          </p>
        </div>
        <div className="form-actions">
          <SubmitButton idleLabel="Preview import" pendingLabel="Validating..." />
          <a className="button button-secondary" download href="/berth-import-template.csv">Download template</a>
          <Link className="text-link" href="/dashboard/berths">Cancel</Link>
        </div>
        {previewState.status === "error" ? (
          <p className="form-message form-message-error" role="alert"><AlertTriangle size={17} aria-hidden="true" />{previewState.message}</p>
        ) : null}
      </form>

      {preview && !imported ? (
        <section className="form-section" aria-labelledby="import-preview-heading">
          <div className="form-section-heading">
            <span>02</span>
            <div>
              <h2 id="import-preview-heading">Review every row</h2>
              <p>{previewState.message}</p>
            </div>
          </div>
          <div className="import-summary" aria-label="Import preview summary">
            <span>{preview.rows.length} rows</span>
            <span>{preview.validCount} valid</span>
            <span>{preview.errorCount} with errors</span>
          </div>
          <div className="berth-table-wrap">
            <table className="berth-table berth-import-table">
              <thead><tr><th>CSV row</th><th>Code / Zone</th><th>Dimensions</th><th>Status / Priority</th><th>Result</th></tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr className={row.errors.length > 0 ? "import-row-error" : undefined} key={row.rowNumber}>
                    <td className="mono-cell">{row.rowNumber}</td>
                    <td><strong>{row.berth?.code ?? (row.rawCode || "Invalid")}</strong><span>{row.berth?.zone ?? (row.rawZone || "—")}</span></td>
                    <td className="dimension-cell">
                      {row.berth ? <><span>L {row.berth.maxLengthM.toFixed(2)} m</span><span>B {row.berth.maxBeamM.toFixed(2)} m</span><span>D {row.berth.maxDraftM.toFixed(2)} m</span></> : "—"}
                    </td>
                    <td>{row.berth ? <><strong>{row.berth.status.replaceAll("_", " ")}</strong><span>Priority {row.berth.priority}</span></> : "—"}</td>
                    <td>
                      {row.errors.length > 0 ? (
                        <ul className="import-errors">{row.errors.map((error) => <li key={error}>{error}</li>)}</ul>
                      ) : <span className="import-valid"><CheckCircle2 size={15} aria-hidden="true" />Ready</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewState.payload ? (
            <form action={applyAction} className="import-apply-form">
              <input name="payload" type="hidden" value={previewState.payload} />
              <p>All rows will be inserted together. If any database check fails, the entire import and its audit entries are rolled back.</p>
              <SubmitButton idleLabel={`Import ${preview.validCount} berths`} pendingLabel="Importing..." />
            </form>
          ) : (
            <p className="form-message form-message-error" role="alert"><AlertTriangle size={17} aria-hidden="true" />Correct the CSV errors and preview the file again. No rows have been saved.</p>
          )}
          {applyState.status === "error" ? (
            <p className="form-message form-message-error" role="alert"><AlertTriangle size={17} aria-hidden="true" />{applyState.message}</p>
          ) : null}
        </section>
      ) : null}

      {imported ? (
        <section className="form-section import-success" role="status">
          <CheckCircle2 size={28} aria-hidden="true" />
          <div><h2>Import complete</h2><p>{applyState.message}</p></div>
          <Link className="button button-primary" href="/dashboard/berths">View berth inventory</Link>
        </section>
      ) : null}
    </div>
  );
}
