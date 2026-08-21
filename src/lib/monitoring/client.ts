"use client";

import posthog from "posthog-js";

export type ProductEvent = "demo_cta_clicked" | "auth_form_opened";

export function trackEvent(event: ProductEvent, properties?: Record<string, string | number | boolean>) {
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) posthog.capture(event, properties);
}
