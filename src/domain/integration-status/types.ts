export type ReadinessState = "ready" | "warning" | "not_ready";

export type IntegrationCheck = {
  label: string;
  state: ReadinessState;
  detail: string;
};

export type IntegrationReadiness = {
  state: ReadinessState;
  mode: string;
  checks: IntegrationCheck[];
  missingRequiredEnvironment: string[];
};

export type IntegrationHealth = {
  stripeWebhookEventCount: number;
  latestStripeWebhookAt: string | null;
  latestStripeWebhookOutcome: string | null;
  pendingPaymentCount: number;
  failedPaymentCount: number;
  pendingNotificationCount: number;
  processingNotificationCount: number;
  failedNotificationCount: number;
  sentNotificationCount: number;
  latestNotificationAttemptAt: string | null;
  latestNotificationAttemptOutcome: string | null;
};

export type IntegrationStatus = {
  stripe: IntegrationReadiness;
  postmark: IntegrationReadiness;
  worker: IntegrationReadiness;
  health: IntegrationHealth;
};
