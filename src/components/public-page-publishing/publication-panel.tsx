"use client";

import { Ban, Building2, CircleDollarSign, Clock3, CreditCard, ExternalLink, Info, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { PublicationActionState } from "@/app/dashboard/settings/publishing/actions";
import type { PublicationSettings } from "@/domain/public-page-publishing/types";
import styles from "./publishing-settings.module.css";

const initialState: PublicationActionState = { status: "idle" };
type PublicationAction = (state: PublicationActionState, formData: FormData) => Promise<PublicationActionState>;

function SubmitButton({ isPublic, ready }: { isPublic: boolean; ready: boolean }) {
  const { pending } = useFormStatus();
  const blocked = !isPublic && !ready;
  return (
    <button className={`${styles.button} ${isPublic ? styles.unpublish : styles.publish}`} disabled={pending || blocked} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {!pending && isPublic ? <Ban size={15} aria-hidden="true" /> : null}
      {pending ? "Updating..." : isPublic ? "Unpublish Booking Page" : "Publish Booking Page"}
    </button>
  );
}

const readinessPresentation = {
  profile: { name: "Marina Profile", icon: Building2 },
  pricing: { name: "Pricing & Seasonal Rates", icon: CircleDollarSign },
  stripe: { name: "Payment Readiness (Stripe)", icon: CreditCard },
  postmark: { name: "Email Delivery (Postmark)", icon: Mail },
  worker: { name: "Notification Worker & Scheduler", icon: Clock3 },
};

export function PublicationPanel({ action, settings, publicUrl }: { action: PublicationAction; settings: PublicationSettings; publicUrl: string }) {
  const [state, formAction] = useActionState(action, initialState);
  const { profile, readiness } = settings;
  const readyCount = readiness.items.filter((item) => item.state === "ready").length;
  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="public-booking-page-heading">
        <div className={styles.sectionHeading}>
          <div>
            <div className={styles.titleLine}>
              <h2 id="public-booking-page-heading">Public Booking Page</h2>
              <span className={`${styles.badge} ${profile.isPublic ? styles.ready : styles.neutral}`}><span aria-hidden="true" />{profile.isPublic ? "Published" : "Unpublished"}</span>
            </div>
            <p>A single booking link for berth availability and guest reservations.</p>
          </div>
          {profile.isPublic ? (
            <Link className={styles.button} href={`/marina/${profile.slug}`} target="_blank" rel="noopener noreferrer">
              View Public Page <ExternalLink size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        <div className={styles.url}><span>Public guest booking URL</span><code>{publicUrl}</code></div>
      </section>

      <section className={styles.section} aria-labelledby="publication-readiness-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="publication-readiness-heading">Publishing Readiness</h2>
            <p>Review the required setup before making your booking page available.</p>
          </div>
          <span className={styles.summary}>{readyCount} of {readiness.items.length} Ready</span>
        </div>
        <ul className={styles.readinessList}>
          {readiness.items.map((item) => {
            const { name, icon: Icon } = readinessPresentation[item.key];
            return (
              <li key={item.key} className={styles.row}>
                <span className={styles.icon}><Icon size={18} aria-hidden="true" /></span>
                <div className={styles.rowCopy}><Link href={item.href}>{name}</Link><p>{item.detail}</p></div>
                <span className={`${styles.badge} ${item.state === "ready" ? styles.ready : styles.attention}`}><span aria-hidden="true" />{item.state === "ready" ? "Ready" : "Action Required"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="publication-state-heading">
        <form action={formAction}>
          <input name="publicationState" type="hidden" value={profile.isPublic ? "unpublish" : "publish"} />
          {state.message ? <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role={state.status === "success" ? "status" : "alert"}>{state.message}</p> : null}
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="publication-state-heading">Publication Status</h2>
              <p>{profile.isPublic ? "Unpublishing removes public booking access. Existing bookings and internal operations are unaffected." : "Publish your booking page to let guests browse availability and book online."}</p>
              {!readiness.ready ? <p className={styles.helper}>{profile.isPublic ? "Resolve readiness blockers before publishing again after unpublishing." : "Complete the required setup to enable publishing."}</p> : readyCount < readiness.items.length ? <p className={styles.helper}>Environment warnings do not block publishing; review them before production use.</p> : null}
            </div>
            <SubmitButton isPublic={profile.isPublic} ready={readiness.ready} />
          </div>
        </form>
      </section>
      <footer className={styles.footer}><p><Info size={16} aria-hidden="true" />Publication changes leave existing bookings and financial history unchanged.</p><Link className={styles.button} href="/dashboard/settings">Back to Settings</Link></footer>
    </div>
  );
}
