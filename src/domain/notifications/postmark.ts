import "server-only";
import type { ClaimedNotification, DeliveryResult } from "@/domain/notifications/types";

type FetchLike = typeof fetch;

function requiredEnv(name: "POSTMARK_SERVER_TOKEN" | "POSTMARK_FROM_EMAIL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function sendWithPostmark(
  notification: ClaimedNotification,
  fetchImpl: FetchLike = fetch,
): Promise<DeliveryResult> {
  const token = requiredEnv("POSTMARK_SERVER_TOKEN");
  const from = requiredEnv("POSTMARK_FROM_EMAIL");
  const response = await fetchImpl("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: from,
      To: notification.recipient_name
        ? `${notification.recipient_name.replace(/[<>\r\n]/g, "")} <${notification.recipient_email}>`
        : notification.recipient_email,
      Subject: notification.subject,
      TextBody: notification.text_body,
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound",
      Tag: notification.event_type,
      Metadata: {
        "notification-id": notification.id,
        "booking-id": notification.booking_id ?? "none",
      },
      Headers: [{
        Name: "Message-ID",
        Value: `<notification-${notification.id}@berthio.invalid>`,
      }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => null) as null | {
    ErrorCode?: number;
    Message?: string;
    MessageID?: string;
  };
  if (!response.ok || payload?.ErrorCode !== 0 || !payload.MessageID) {
    const providerMessage = payload?.Message?.slice(0, 500) || `HTTP ${response.status}`;
    throw new Error(`Postmark rejected the notification: ${providerMessage}`);
  }
  return { messageId: payload.MessageID };
}
