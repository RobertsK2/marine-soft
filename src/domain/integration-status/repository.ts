import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIntegrationStatus } from "@/domain/integration-status/model";
import type { Database } from "@/types/database";

const LOCAL_PLATFORM_ACCOUNT_MARKER = "acct_testmarinaa";

export class IntegrationStatusRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IntegrationStatusRepositoryError";
  }
}

export async function loadIntegrationStatus(supabase: SupabaseClient<Database>, marinaId: string) {
  const [marinaResult, healthResult] = await Promise.all([
    supabase.from("marinas").select("stripe_account_id").eq("id", marinaId).maybeSingle(),
    supabase.rpc("get_marina_integration_health", { target_marina_id: marinaId }),
  ]);
  const error = marinaResult.error ?? healthResult.error;
  if (error) throw new IntegrationStatusRepositoryError("Unable to load integration status.", { cause: error });
  if (!marinaResult.data) throw new IntegrationStatusRepositoryError("Marina integration status was not found.");
  const health = healthResult.data?.[0];
  if (!health) throw new IntegrationStatusRepositoryError("Marina integration health was not returned.");

  return buildIntegrationStatus({
    environment: process.env,
    nodeEnvironment: process.env.NODE_ENV ?? "development",
    stripeAccountConfigured: Boolean(marinaResult.data.stripe_account_id),
    stripeAccountIsLocalMarker: marinaResult.data.stripe_account_id === LOCAL_PLATFORM_ACCOUNT_MARKER,
    health: {
      stripeWebhookEventCount: health.stripe_webhook_event_count,
      latestStripeWebhookAt: health.latest_stripe_webhook_at,
      latestStripeWebhookOutcome: health.latest_stripe_webhook_outcome,
      pendingPaymentCount: health.pending_payment_count,
      failedPaymentCount: health.failed_payment_count,
      pendingNotificationCount: health.pending_notification_count,
      processingNotificationCount: health.processing_notification_count,
      failedNotificationCount: health.failed_notification_count,
      sentNotificationCount: health.sent_notification_count,
      latestNotificationAttemptAt: health.latest_notification_attempt_at,
      latestNotificationAttemptOutcome: health.latest_notification_attempt_outcome,
    },
  });
}
