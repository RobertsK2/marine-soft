import * as Sentry from "@sentry/nextjs";

function safeOperation(context: Record<string, string | number | boolean | null>) {
  const operation = context.operation;
  return typeof operation === "string" && /^[a-z_]{1,80}$/.test(operation)
    ? operation
    : "unknown";
}

export function captureServerError(
  _error: unknown,
  context: Record<string, string | number | boolean | null> = {},
) {
  // Exception messages, causes, stacks and caller context can contain guest data
  // or provider payloads. Only a fixed marker and validated operation leave here.
  const safeContext = { operation: safeOperation(context) };
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(new Error("Server operation failed"), { extra: safeContext });
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    console.error("Berthio server error", safeContext);
  }
}
