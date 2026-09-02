import "server-only";
import { captureServerError } from "@/lib/monitoring/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { sendWithPostmark } from "@/domain/notifications/postmark";
import type {
  ClaimedNotification,
  NotificationBatchResult,
  NotificationTransport,
} from "@/domain/notifications/types";

type CompleteDelivery = (
  notification: ClaimedNotification,
  result: { succeeded: true; messageId: string } | { succeeded: false; error: string },
) => Promise<void>;

export async function processClaimedNotifications(
  notifications: ClaimedNotification[],
  send: NotificationTransport,
  complete: CompleteDelivery,
) {
  let sent = 0;
  let failed = 0;
  for (const notification of notifications) {
    let result: Awaited<ReturnType<NotificationTransport>>;
    try {
      result = await send(notification);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown notification delivery error.";
      await complete(notification, { succeeded: false, error: message });
      captureServerError(error, {
        operation: "notification_delivery",
        notificationId: notification.id,
        eventType: notification.event_type,
      });
      failed += 1;
      continue;
    }
    await complete(notification, { succeeded: true, messageId: result.messageId });
    sent += 1;
  }
  return { sent, failed };
}

export async function deliverOperationalNotifications(
  requestedLimit = 10,
  transport: NotificationTransport = sendWithPostmark,
): Promise<NotificationBatchResult> {
  const limit = Math.max(1, Math.min(50, Math.trunc(requestedLimit)));
  const supabase = createPrivilegedClient();
  const arrivalResult = await supabase.rpc("queue_upcoming_arrival_reminders");
  if (arrivalResult.error) throw arrivalResult.error;

  const claimResult = await supabase.rpc("claim_notification_deliveries", {
    requested_limit: limit,
    requested_lease_seconds: 120,
  });
  if (claimResult.error) throw claimResult.error;
  const notifications = (claimResult.data ?? []) as ClaimedNotification[];
  const delivery = await processClaimedNotifications(notifications, transport, async (notification, result) => {
    const completion = await supabase.rpc("complete_notification_delivery", {
      target_notification_id: notification.id,
      target_lease_token: notification.lease_token,
      delivery_succeeded: result.succeeded,
      target_provider_message_id: result.succeeded ? result.messageId : null,
      target_error_message: result.succeeded ? null : result.error,
    });
    if (completion.error) throw completion.error;
    if (!['sent', 'failed', 'already_sent'].includes(completion.data)) {
      throw new Error(`Notification completion was rejected: ${completion.data}`);
    }
  });
  return {
    queuedArrivalReminders: arrivalResult.data ?? 0,
    claimed: notifications.length,
    ...delivery,
  };
}
