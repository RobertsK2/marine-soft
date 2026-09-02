import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: vi.fn() }));

import { sendWithPostmark } from "@/domain/notifications/postmark";
import { processClaimedNotifications } from "@/domain/notifications/service";
import type { ClaimedNotification } from "@/domain/notifications/types";

const notification: ClaimedNotification = {
  id: "10000000-0000-4000-8000-000000000001",
  marina_id: "20000000-0000-4000-8000-000000000001",
  booking_id: "30000000-0000-4000-8000-000000000001",
  event_type: "booking_confirmation",
  dedupe_key: "booking-confirmation:30000000-0000-4000-8000-000000000001",
  recipient_email: "guest@example.test",
  recipient_name: "Guest <script>",
  subject: "Booking confirmed",
  text_body: "Your booking is confirmed.",
  attempt_count: 1,
  lease_token: "40000000-0000-4000-8000-000000000001",
};

describe("operational notification delivery", () => {
  beforeEach(() => {
    process.env.POSTMARK_SERVER_TOKEN = "POSTMARK_API_TEST";
    process.env.POSTMARK_FROM_EMAIL = "Berthio <bookings@example.test>";
  });

  it("submits a transactional Postmark message with a stable message ID", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.To).toBe("Guest script <guest@example.test>");
      expect(body.Headers[0].Value).toContain(notification.id);
      expect(body.Metadata["notification-id"]).toBe(notification.id);
      return new Response(JSON.stringify({ ErrorCode: 0, Message: "OK", MessageID: "pm-1" }), { status: 200 });
    });
    await expect(sendWithPostmark(notification, fetchMock)).resolves.toEqual({ messageId: "pm-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records provider failures and continues the batch", async () => {
    const second = { ...notification, id: "10000000-0000-4000-8000-000000000002" };
    const complete = vi.fn(async () => undefined);
    const send = vi.fn(async (item: ClaimedNotification) => {
      if (item.id === notification.id) throw new Error("provider unavailable");
      return { messageId: "pm-2" };
    });
    await expect(processClaimedNotifications([notification, second], send, complete)).resolves.toEqual({ sent: 1, failed: 1 });
    expect(complete).toHaveBeenNthCalledWith(1, notification, { succeeded: false, error: "provider unavailable" });
    expect(complete).toHaveBeenNthCalledWith(2, second, { succeeded: true, messageId: "pm-2" });
  });

  it("does not relabel an accepted email as failed when logging success fails", async () => {
    const complete = vi.fn(async () => { throw new Error("database unavailable"); });
    await expect(processClaimedNotifications(
      [notification],
      async () => ({ messageId: "pm-accepted" }),
      complete,
    )).rejects.toThrow("database unavailable");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("treats Postmark API error payloads as delivery failures", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ ErrorCode: 406, Message: "Inactive recipient" }),
      { status: 422 },
    ));
    await expect(sendWithPostmark(notification, fetchMock)).rejects.toThrow("Inactive recipient");
  });
});
