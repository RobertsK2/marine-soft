import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: vi.fn() }));

import { sendWithResend } from "@/domain/notifications/resend";
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
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Berthio <bookings@example.test>";
  });

  it("submits a transactional Resend message with an idempotency key", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(url).toBe("https://api.resend.com/emails");
      expect(init?.headers).toMatchObject({ "Idempotency-Key": notification.id });
      expect(body.from).toBe("Berthio <bookings@example.test>");
      expect(body.to).toEqual(["guest@example.test"]);
      expect(body.text).toBe(notification.text_body);
      expect(body.tags).toEqual([{ name: "event_type", value: "booking_confirmation" }]);
      return new Response(JSON.stringify({ id: "resend-1" }), { status: 200 });
    });
    await expect(sendWithResend(notification, fetchMock)).resolves.toEqual({ messageId: "resend-1" });
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

  it("treats Resend API error payloads as delivery failures", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ message: "Inactive recipient" }),
      { status: 422 },
    ));
    await expect(sendWithResend(notification, fetchMock)).rejects.toThrow("Inactive recipient");
  });
});
