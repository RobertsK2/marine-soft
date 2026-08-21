import * as Sentry from "@sentry/nextjs";

export function captureServerError(
  error: unknown,
  context: Record<string, string | number | boolean | null> = {},
) {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
    return;
  }

  if (process.env.NODE_ENV !== "test") {
    console.error("DockPay server error", { error, context });
  }
}
