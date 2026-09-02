import { describe, expect, it } from "vitest";
import { auditActorLabel, auditChangedFields } from "@/domain/audit-log/model";

describe("audit log presentation model", () => {
  it("labels members, guests, and system activity", () => {
    expect(auditActorLabel("member", "staff@example.test")).toBe("staff@example.test");
    expect(auditActorLabel("member", null)).toBe("Marina member");
    expect(auditActorLabel("guest", null)).toBe("Guest");
    expect(auditActorLabel("system", null)).toBe("Berthio system");
  });

  it("reports changed fields without timestamp noise", () => {
    expect(auditChangedFields(
      { status: "confirmed", eta: "10:00", updated_at: "before" },
      { status: "checked_in", eta: "10:00", updated_at: "after" },
    )).toEqual(["status"]);
  });

  it("does not invent a field diff for create events", () => {
    expect(auditChangedFields(null, { status: "confirmed" })).toEqual([]);
  });
});
