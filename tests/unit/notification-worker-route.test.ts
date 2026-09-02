import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/domain/notifications/service", () => ({
  deliverOperationalNotifications: vi.fn(async () => ({
    queuedArrivalReminders: 1,
    claimed: 2,
    sent: 1,
    failed: 1,
  })),
}));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: vi.fn() }));

import { deliverOperationalNotifications } from "@/domain/notifications/service";
import { POST } from "@/app/api/notifications/process/route";

describe("notification worker route", () => {
  beforeEach(() => {
    process.env.NOTIFICATION_WORKER_SECRET = "a-long-notification-worker-secret";
    vi.clearAllMocks();
  });

  it("rejects requests without the server-only worker secret", async () => {
    const response = await POST(new Request("http://localhost/api/notifications/process", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(deliverOperationalNotifications).not.toHaveBeenCalled();
  });

  it("processes a bounded batch for an authorized scheduler", async () => {
    const response = await POST(new Request("http://localhost/api/notifications/process?limit=7", {
      method: "POST",
      headers: { Authorization: "Bearer a-long-notification-worker-secret" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ queuedArrivalReminders: 1, claimed: 2, sent: 1, failed: 1 });
    expect(deliverOperationalNotifications).toHaveBeenCalledWith(7);
  });
});
