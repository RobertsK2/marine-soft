"use client";

import { AlertTriangle, Check, CircleX, ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { PublicationActionState } from "@/app/dashboard/settings/publishing/actions";
import type { PublicationSettings } from "@/domain/public-page-publishing/types";

const initialState: PublicationActionState = { status: "idle" };
type PublicationAction = (state: PublicationActionState, formData: FormData) => Promise<PublicationActionState>;

function SubmitButton({ isPublic, ready }: { isPublic: boolean; ready: boolean }) {
  const { pending } = useFormStatus();
  const blocked = !isPublic && !ready;
  return (
    <button className={isPublic ? "button button-secondary" : "button button-primary"} disabled={pending || blocked} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Updating..." : isPublic ? "Unpublish public page" : "Publish public page"}
    </button>
  );
}

export function PublicationPanel({ action, settings }: { action: PublicationAction; settings: PublicationSettings }) {
  const [state, formAction] = useActionState(action, initialState);
  const { profile, readiness } = settings;
  return (
    <div className="publication-settings">
      <section className="form-section" aria-labelledby="publication-state-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2 id="publication-state-heading">Publication state</h2>
            <p>The public slug remains <code>/marina/{profile.slug}</code>.</p>
          </div>
        </div>
        <div className={`publication-state publication-state-${profile.isPublic ? "published" : "unpublished"}`}>
          <div>
            <strong>{profile.isPublic ? "Published" : "Unpublished"}</strong>
            <p>{profile.isPublic ? "The existing public booking flow is available." : "The public slug returns the standard not-found response."}</p>
          </div>
          {profile.isPublic ? (
            <Link className="button button-quiet" href={`/marina/${profile.slug}`} target="_blank">
              View public page <ExternalLink size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </section>

      <section className="form-section" aria-labelledby="publication-readiness-heading">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2 id="publication-readiness-heading">Publishing readiness</h2>
            <p>Not-ready items block publishing. Attention items are visible but do not block guarded non-production verification.</p>
          </div>
        </div>
        <ul className="publication-readiness-list">
          {readiness.items.map((item) => (
            <li key={item.key}>
              <span className={`integration-check-icon integration-check-icon-${item.state}`}>
                {item.state === "ready" ? <Check size={15} aria-hidden="true" /> : item.state === "warning" ? <AlertTriangle size={15} aria-hidden="true" /> : <CircleX size={15} aria-hidden="true" />}
              </span>
              <div><strong>{item.label}</strong><p>{item.detail}</p></div>
              <Link href={item.href}>Review</Link>
            </li>
          ))}
        </ul>
        {!readiness.ready && !profile.isPublic ? <p className="form-message form-error" role="alert">Publishing is blocked until every required item is ready.</p> : null}
        {profile.isPublic && !readiness.ready ? <p className="integration-warning" role="status">This page remains published to preserve its existing state, but it cannot be republished after unpublishing until readiness blockers are resolved.</p> : null}
      </section>

      <form action={formAction}>
        <input name="publicationState" type="hidden" value={profile.isPublic ? "unpublish" : "publish"} />
        {state.message ? <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role={state.status === "success" ? "status" : "alert"}>{state.message}</p> : null}
        <p className="map-readonly-note">Changing publication does not edit bookings, price snapshots, payment records, refunds, checkout sessions, or notification delivery.</p>
        <div className="form-actions"><SubmitButton isPublic={profile.isPublic} ready={readiness.ready} /></div>
      </form>
    </div>
  );
}

