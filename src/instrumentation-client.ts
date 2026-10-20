import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    release: process.env._sentryRelease || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim(),
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
      }
      return event;
    },
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
  });
}

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    capture_pageview: "history_change",
    person_profiles: "identified_only",
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
