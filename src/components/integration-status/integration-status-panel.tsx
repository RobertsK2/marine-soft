import { CreditCard, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { IntegrationStatus, ReadinessState } from "@/domain/integration-status/types";
import styles from "./integration-settings.module.css";

function stateLabel(state: ReadinessState) {
  if (state === "ready") return "Ready";
  if (state === "warning") return "Attention needed";
  return "Not ready";
}

function IntegrationRow({ id, name, description, icon, state, label, detail }: {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  state: ReadinessState;
  label?: string;
  detail?: string;
}) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`}>
      <div className={styles.row}>
        <span className={`${styles.icon} ${styles[id]}`} aria-hidden="true">{icon}</span>
        <div className={styles.copy}>
          <h2 id={`${id}-heading`}>{name}</h2>
          <p>{description}</p>
          {detail ? <small>{detail}</small> : null}
        </div>
        <span className={`${styles.status} ${styles[state]}`}><span aria-hidden="true" />{label ?? stateLabel(state)}</span>
      </div>
    </section>
  );
}

export function IntegrationStatusPanel({ status, timezone, checkedAt, monitoringConfigured }: {
  status: IntegrationStatus;
  timezone: string;
  checkedAt: string;
  monitoringConfigured: boolean;
}) {
  const workerProtection = status.worker.checks.find((check) => check.label === "Endpoint protection");
  const scheduler = status.worker.checks.find((check) => check.label === "Scheduler invocation");

  return (
    <div className={styles.panel}>
      <IntegrationRow id="stripe" name="Stripe Payments" icon={<CreditCard size={20} />}
        state={status.stripe.state}
        description={status.stripe.state === "ready" ? "Configured to accept guest card payments." : status.stripe.state === "warning" ? "Test payments only; live payment readiness is not confirmed." : "Payment setup is incomplete; payment readiness is not confirmed."}
        detail={status.stripe.mode} />
      <IntegrationRow id="postmark" name="Postmark / Email Delivery" icon={<Mail size={20} />}
        state={status.postmark.state}
        description={status.postmark.state === "ready" ? "Configured to deliver transactional booking emails." : status.postmark.mode === "Test delivery" ? "Test delivery is enabled; booking emails are not delivered." : "Email setup is incomplete; booking email delivery is not ready."} />
      <IntegrationRow id="worker" name="Notification Worker & Scheduler" icon={<RefreshCw size={20} />}
        state={status.worker.state} description="Processes queued booking emails and scheduled notifications."
        detail={`Worker: ${workerProtection?.state === "ready" ? "configured" : workerProtection?.state === "warning" ? "protection needs attention" : "not ready"} · Scheduler: ${scheduler?.state === "ready" ? "declared configured" : "unverified"}`} />
      <IntegrationRow id="monitoring" name="System Diagnostics (Sentry)" icon={<ShieldCheck size={20} />}
        state={monitoringConfigured ? "ready" : "warning"} label={monitoringConfigured ? "Configured" : "Not configured"}
        description="Reports application errors for investigation." />
      <footer className={styles.footer}>
        <div className={styles.footerCopy}>
          <p>Last checked: <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" })}</time></p>
          <small>Configuration checks only; live service availability is not verified.</small>
        </div>
        <Link className={styles.backButton} href="/dashboard/settings">Back to Settings</Link>
      </footer>
    </div>
  );
}
