import "server-only";
import type { ClaimedNotification, DeliveryResult } from "@/domain/notifications/types";

type FetchLike = typeof fetch;

function requiredEnv(name: "RESEND_API_KEY" | "EMAIL_FROM") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function sendWithResend(
  notification: ClaimedNotification,
  fetchImpl: FetchLike = fetch,
): Promise<DeliveryResult> {
  const token = requiredEnv("RESEND_API_KEY");
  const from = requiredEnv("EMAIL_FROM");
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": notification.id,
    },
    body: JSON.stringify({
      from,
      to: [notification.recipient_email],
      subject: notification.subject,
      text: notification.text_body,
      tags: [{ name: "event_type", value: notification.event_type }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => null) as null | {
    id?: string;
    message?: string;
  };
  if (!response.ok || !payload?.id) {
    const providerMessage = payload?.message?.slice(0, 500) || `HTTP ${response.status}`;
    throw new Error(`Resend rejected the notification: ${providerMessage}`);
  }
  return { messageId: payload.id };
}
