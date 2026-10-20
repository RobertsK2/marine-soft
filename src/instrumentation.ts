import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim()
      || process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim()
      || process.env.VERCEL_ENV
      || process.env.NODE_ENV,
    release:
      process.env._sentryRelease
      || process.env.VERCEL_GIT_COMMIT_SHA?.trim()
      || process.env.SENTRY_RELEASE?.trim(),
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
