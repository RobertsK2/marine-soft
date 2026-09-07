import { describe, expect, it } from "vitest";
import { filterAuditEvents, toAuditTableEvent } from "@/components/audit-log/audit-table-model";
import type { AuditEvent } from "@/domain/audit-log/types";

const event: AuditEvent = {
  id: 1, marina_id: "private-marina-id", entity_id: "private-entity-id", booking_id: null, berth_id: null,
  actor_id: "private-actor-id", actor_email: "admin@example.test", actor_type: "member",
  event_type: "marina.unpublished", entity_type: "marina", summary: "Public booking page unpublished",
  occurred_at: "2026-09-06T22:30:00Z", before_data: { isPublic: true }, after_data: { isPublic: false },
  metadata: { source_table: "marinas", operation: "update" },
};

describe("admin audit table", () => {
  it("projects real transitions and excludes private identifiers and credentials, including nested snapshots", () => {
    const safe = toAuditTableEvent({ ...event,
      before_data: { isPublic: true, secret: "private-before", seasons: [{ name: "Summer", id: "private-season", token: "private-token" }] },
      after_data: { isPublic: false, secret: "private-after", seasons: [{ name: "Winter", id: "private-season-new", token: "private-token-new" }] },
      metadata: { source_table: "marinas", token: "private-metadata" },
    });
    expect(safe.changes).toContainEqual({ field: "Is Public", before: "Yes", after: "No" });
    expect(safe.changes).toContainEqual({ field: "Seasons", before: "Name: Summer", after: "Name: Winter" });
    expect(JSON.stringify(safe)).not.toContain("private-");
  });
  it("does not invent previous values for creation events", () => {
    const safe = toAuditTableEvent({ ...event, before_data: null, after_data: { status: "confirmed" } });
    expect(safe.changes).toEqual([{ field: "Status", before: null, after: "confirmed" }]);
  });
  it("redacts identifiers and credential patterns embedded in recorded summaries", () => {
    const safe = toAuditTableEvent({ ...event, summary: "Account acct_private123 token=private-value 12345678-1234-1234-1234-123456789abc" });
    expect(safe.summary).toBe("Account [redacted] [redacted] [redacted]");
  });
  it("combines search and filters without reordering equal-time events", () => {
    const first = toAuditTableEvent(event);
    const second = { ...first, summary: "Another publication event" };
    const filters = { search: "unpublished", actor: first.actor, action: first.action, from: "2026-09-07", to: "2026-09-07" };
    expect(filterAuditEvents([first, second], filters, "Europe/Riga")).toEqual([first, second]);
    expect(filterAuditEvents([first], filters, "UTC")).toEqual([]);
    expect(filterAuditEvents([first], { ...filters, actor: "Other actor" }, "Europe/Riga")).toEqual([]);
  });
});
