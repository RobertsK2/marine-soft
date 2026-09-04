import type {
  IntegrationCheck,
  IntegrationHealth,
  IntegrationReadiness,
  IntegrationStatus,
  ReadinessState,
} from "@/domain/integration-status/types";

type Environment = Record<string, string | undefined>;

const localHosts = new Set(["localhost", "127.0.0.1"]);

function value(environment: Environment, name: string) {
  const normalized = environment[name]?.trim();
  return normalized && !/replace_for_each_environment|replace_with_/i.test(normalized) ? normalized : null;
}

function check(label: string, state: ReadinessState, detail: string): IntegrationCheck {
  return { label, state, detail };
}

function combinedState(checks: IntegrationCheck[]): ReadinessState {
  if (checks.some((item) => item.state === "not_ready")) return "not_ready";
  if (checks.some((item) => item.state === "warning")) return "warning";
  return "ready";
}

function isLocalUrl(candidate: string | null) {
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" && localHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function readiness(mode: string, checks: IntegrationCheck[], required: string[], environment: Environment): IntegrationReadiness {
  return {
    state: combinedState(checks),
    mode,
    checks,
    missingRequiredEnvironment: required.filter((name) => !value(environment, name)),
  };
}

export function buildIntegrationStatus({
  environment,
  nodeEnvironment,
  stripeAccountConfigured,
  stripeAccountIsLocalMarker,
  health,
}: {
  environment: Environment;
  nodeEnvironment: string;
  stripeAccountConfigured: boolean;
  stripeAccountIsLocalMarker: boolean;
  health: IntegrationHealth;
}): IntegrationStatus {
  const stripeSecret = value(environment, "STRIPE_SECRET_KEY");
  const stripePublishable = value(environment, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  const stripeWebhook = value(environment, "STRIPE_CONNECT_WEBHOOK_SECRET");
  const stripeSecretMode = stripeSecret?.match(/^(?:sk|rk)_(test|live)_[A-Za-z0-9_-]+$/)?.[1] ?? null;
  const stripePublishableMode = stripePublishable?.match(/^pk_(test|live)_[A-Za-z0-9_-]+$/)?.[1] ?? null;
  const localFallbackRequested = environment.STRIPE_LOCAL_PLATFORM_FALLBACK?.trim() === "true";
  const localFallbackSafe = localFallbackRequested && nodeEnvironment !== "production"
    && isLocalUrl(value(environment, "NEXT_PUBLIC_SITE_URL"))
    && isLocalUrl(value(environment, "NEXT_PUBLIC_SUPABASE_URL"))
    && Boolean(stripeSecret?.match(/^sk_test_[A-Za-z0-9_-]+$/));
  const stripeMode = localFallbackRequested
    ? (localFallbackSafe ? "Local development fallback" : "Invalid local fallback")
    : stripeSecretMode === "live" ? "Live Connect" : stripeSecretMode === "test" ? "Test Connect" : "Not configured";

  const stripeChecks = [
    check("Server API credential", stripeSecretMode ? "ready" : "not_ready", stripeSecretMode ? `${stripeSecretMode === "live" ? "Live" : "Test"}-mode server credential detected.` : "STRIPE_SECRET_KEY is missing or has an invalid shape."),
    check("Browser publishable key", stripePublishableMode ? "ready" : "not_ready", stripePublishableMode ? `${stripePublishableMode === "live" ? "Live" : "Test"}-mode publishable key detected.` : "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing or has an invalid shape."),
    check("Connect account", stripeAccountConfigured && (!stripeAccountIsLocalMarker || localFallbackSafe) ? "ready" : "not_ready", stripeAccountConfigured ? (stripeAccountIsLocalMarker ? "Local platform marker is accepted only by the guarded fallback." : "A marina-specific connected account is configured.") : "This marina has no connected account configured."),
    check("Signed webhook", stripeWebhook?.match(/^whsec_[A-Za-z0-9_-]+$/) ? "ready" : "not_ready", stripeWebhook ? "Webhook signing configuration has an invalid shape." : "STRIPE_CONNECT_WEBHOOK_SECRET is missing."),
  ];
  if (stripeSecretMode && stripePublishableMode && stripeSecretMode !== stripePublishableMode) {
    stripeChecks.push(check("Key mode alignment", "not_ready", "Server and publishable Stripe keys use different modes."));
  }
  if (nodeEnvironment === "production" && (stripeSecretMode === "test" || stripePublishableMode === "test" || localFallbackRequested)) {
    stripeChecks.push(check("Production mode", "not_ready", "Production cannot use test keys or the local platform fallback."));
  } else if (localFallbackSafe) {
    stripeChecks.push(check("Production mode", "warning", "Local fallback is suitable for development verification only, not production."));
  } else if (nodeEnvironment !== "production" && stripeSecretMode === "test") {
    stripeChecks.push(check("Production mode", "warning", "Test Connect is configured; live readiness is not asserted."));
  } else if (localFallbackRequested) {
    stripeChecks.push(check("Fallback guard", "not_ready", "The local fallback safety requirements are not satisfied."));
  }

  const postmarkToken = value(environment, "POSTMARK_SERVER_TOKEN");
  const postmarkFrom = value(environment, "POSTMARK_FROM_EMAIL");
  const postmarkTestMode = postmarkToken === "POSTMARK_API_TEST";
  const postmarkChecks = [
    check("Server token", postmarkToken ? (postmarkTestMode ? "warning" : "ready") : "not_ready", postmarkToken ? (postmarkTestMode ? "Postmark test token detected; messages are not delivered." : "Server-side Postmark credential detected.") : "POSTMARK_SERVER_TOKEN is missing."),
    check("Sender identity", postmarkFrom && /^(?:[^\r\n]*<[^\s<>@]+@[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+)$/.test(postmarkFrom) ? "ready" : "not_ready", postmarkFrom ? "POSTMARK_FROM_EMAIL is not a valid sender address." : "POSTMARK_FROM_EMAIL is missing."),
    check("Message stream", "ready", value(environment, "POSTMARK_MESSAGE_STREAM") ? "A message stream is configured." : "The existing outbound message-stream default is active."),
  ];

  const workerSecret = value(environment, "NOTIFICATION_WORKER_SECRET");
  const schedulerDeclared = environment.NOTIFICATION_WORKER_SCHEDULED?.trim() === "true";
  const workerSecretBytes = workerSecret ? new TextEncoder().encode(workerSecret).length : 0;
  const workerChecks = [
    check("Endpoint protection", workerSecret ? (workerSecretBytes >= 32 ? "ready" : "warning") : "not_ready", workerSecret ? (workerSecretBytes >= 32 ? "Bearer protection is configured." : "Worker protection is configured but shorter than the recommended 32 bytes.") : "NOTIFICATION_WORKER_SECRET is missing; the endpoint remains fail-closed."),
    check("Scheduler invocation", schedulerDeclared ? "ready" : "warning", schedulerDeclared ? "External scheduler invocation is declared configured." : "Set NOTIFICATION_WORKER_SCHEDULED=true only after an external scheduler invokes the protected endpoint."),
  ];

  return {
    stripe: readiness(stripeMode, stripeChecks, ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET"], environment),
    postmark: readiness(postmarkTestMode ? "Test delivery" : postmarkToken ? "Postmark delivery" : "Not configured", postmarkChecks, ["POSTMARK_SERVER_TOKEN", "POSTMARK_FROM_EMAIL"], environment),
    worker: readiness(schedulerDeclared ? "Protected and scheduled" : workerSecret ? "Protected, schedule unverified" : "Fail-closed", workerChecks, ["NOTIFICATION_WORKER_SECRET"], environment),
    health,
  };
}
