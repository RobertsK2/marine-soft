import { ClipboardClock } from "lucide-react";
import { auditActorLabel, auditChangedFields } from "@/domain/audit-log/model";
import type { AuditEvent } from "@/domain/audit-log/types";

export function AuditHistory({ events, timezone, title = "Operational history" }: {
  events: AuditEvent[];
  timezone: string;
  title?: string;
}) {
  return (
    <section className="audit-history" aria-labelledby="audit-history-heading">
      <div className="panel-heading">
        <ClipboardClock size={18} aria-hidden="true" />
        <h2 id="audit-history-heading">{title}</h2>
      </div>
      {events.length ? (
        <ol className="audit-event-list">
          {events.map((event) => {
            const fields = auditChangedFields(event.before_data, event.after_data);
            return (
              <li key={event.id}>
                <div className="audit-event-code">
                  <span>{event.event_type.replaceAll(".", " / ")}</span>
                  <time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString("en-GB", { timeZone: timezone })}</time>
                </div>
                <strong>{event.summary}</strong>
                <p>{auditActorLabel(event.actor_type, event.actor_email)}</p>
                {fields.length ? <small>Changed: {fields.join(", ")}</small> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="map-readonly-note">No recorded operational changes yet.</p>}
    </section>
  );
}
