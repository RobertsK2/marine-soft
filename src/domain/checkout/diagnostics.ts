export type CheckoutFailureStage =
  | "stripe_initialization"
  | "payment_preparation"
  | "connected_account_configuration"
  | "site_url"
  | "stripe_api"
  | "payment_attachment"
  | "checkout_response";

const STRIPE_CATEGORIES = {
  StripeAuthenticationError: "stripe_authentication",
  StripePermissionError: "stripe_permission",
  StripeInvalidRequestError: "stripe_invalid_request",
  StripeRateLimitError: "stripe_rate_limit",
  StripeAPIError: "stripe_api_error",
  StripeConnectionError: "stripe_connection",
  StripeIdempotencyError: "stripe_idempotency",
} as const;

// Never forward an arbitrary provider-supplied string to logs or Sentry.
const SAFE_STRIPE_CODES = new Set([
  "account_invalid", "api_key_expired", "idempotency_key_in_use",
  "parameter_invalid_empty", "parameter_invalid_integer", "parameter_missing",
  "parameter_unknown", "permission_denied", "resource_missing",
]);

const STAGES = new Set<CheckoutFailureStage>([
  "stripe_initialization", "payment_preparation", "connected_account_configuration",
  "site_url", "stripe_api", "payment_attachment", "checkout_response",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function classifyCheckoutFailure(error: unknown) {
  const outer = record(error);
  const stage = STAGES.has(outer?.diagnosticStage as CheckoutFailureStage)
    ? outer?.diagnosticStage as CheckoutFailureStage : "checkout_response";
  const cause = record(outer?.cause) ?? outer;
  const stripeType = cause?.type;
  const stripeCategory = typeof stripeType === "string" &&
    Object.prototype.hasOwnProperty.call(STRIPE_CATEGORIES, stripeType)
    ? STRIPE_CATEGORIES[stripeType as keyof typeof STRIPE_CATEGORIES] : "stripe_unknown";
  const code = cause?.code;

  return {
    operation: "stripe_checkout_create" as const,
    stage,
    category: stage === "stripe_api" ? stripeCategory
      : stage === "payment_preparation" || stage === "payment_attachment" ? "database"
      : stage === "stripe_initialization" || stage === "connected_account_configuration" || stage === "site_url" ? "configuration"
      : "unexpected",
    ...(stage === "stripe_api" && stripeCategory !== "stripe_unknown" &&
      typeof code === "string" && SAFE_STRIPE_CODES.has(code) ? { stripeCode: code } : {}),
  };
}
