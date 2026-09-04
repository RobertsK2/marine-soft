import { AlertTriangle, Check, CircleX, Clock3 } from "lucide-react";
import type { IntegrationReadiness, IntegrationStatus, ReadinessState } from "@/domain/integration-status/types";

function StateIcon({ state }: { state: ReadinessState }) {
  if (state === "ready") return <Check size={15} aria-hidden="true" />;
  if (state === "warning") return <AlertTriangle size={15} aria-hidden="true" />;
  return <CircleX size={15} aria-hidden="true" />;
}

function stateLabel(state: ReadinessState) {
  if (state === "ready") return "Ready";
  if (state === "warning") return "Attention";
  return "Not ready";
}

function ReadinessCard({ name, readiness }: { name: string; readiness: IntegrationReadiness }) {
  const headingId = `${name.toLowerCase().replaceAll(" ", "-")}-integration-heading`;
  return (
    <section className={`integration-card integration-card-${readiness.state}`} aria-labelledby={headingId}>
      <header>
        <div>
          <p>{readiness.mode}</p>
          <h2 id={headingId}>{name}</h2>
        </div>
        <span className={`integration-state integration-state-${readiness.state}`}><StateIcon state={readiness.state} />{stateLabel(readiness.state)}</span>
      </header>
      <ul className="integration-check-list">
        {readiness.checks.map((item) => (
          <li key={item.label}>
            <span className={`integration-check-icon integration-check-icon-${item.state}`}><StateIcon state={item.state} /></span>
            <div><strong>{item.label}</strong><p>{item.detail}</p></div>
          </li>
        ))}
      </ul>
      {readiness.missingRequiredEnvironment.length ? (
        <div className="integration-warning" role="status">
          <strong>Missing required environment</strong>
          <p>{readiness.missingRequiredEnvironment.join(", ")}</p>
        </div>
      ) : null}
    </section>
  );
}

function timestamp(value: string | null, timezone: string) {
  return value ? new Date(value).toLocaleString("en-GB", { timeZone: timezone }) : "No activity recorded";
}

export function IntegrationStatusPanel({ status, timezone }: { status: IntegrationStatus; timezone: string }) {
  const health = status.health;
  return (
    <div className="integration-status">
      <div className="integration-grid">
        <ReadinessCard name="Stripe Connect" readiness={status.stripe} />
        <ReadinessCard name="Postmark" readiness={status.postmark} />
        <ReadinessCard name="Notification worker" readiness={status.worker} />
      </div>

      <section className="integration-health" aria-labelledby="integration-health-heading">
        <header>
          <div><p>Tenant-scoped database signals</p><h2 id="integration-health-heading">Operational health</h2></div>
          <Clock3 size={20} aria-hidden="true" />
        </header>
        <div className="integration-metrics">
          <article><span>Matched webhooks</span><strong>{health.stripeWebhookEventCount}</strong><small>{timestamp(health.latestStripeWebhookAt, timezone)}{health.latestStripeWebhookOutcome ? ` / ${health.latestStripeWebhookOutcome}` : ""}</small></article>
          <article><span>Open payments</span><strong>{health.pendingPaymentCount}</strong><small>{health.failedPaymentCount} failed or expired</small></article>
          <article><span>Queued email</span><strong>{health.pendingNotificationCount}</strong><small>{health.processingNotificationCount} processing / {health.failedNotificationCount} failed</small></article>
          <article><span>Sent email</span><strong>{health.sentNotificationCount}</strong><small>{timestamp(health.latestNotificationAttemptAt, timezone)}{health.latestNotificationAttemptOutcome ? ` / ${health.latestNotificationAttemptOutcome}` : ""}</small></article>
        </div>
        <p className="integration-safety-note">Status checks are read-only. They do not contact customers, create Stripe accounts, process payments, retry notifications, or expose credential values.</p>
      </section>
    </div>
  );
}
