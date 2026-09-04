import "server-only";

import { createHash, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getGuestAccessSigningSecret } from "@/lib/env";
import {
  ANONYMOUS_BOOKING_COOKIE,
  ANONYMOUS_BOOKING_TOKEN_PATTERN,
  createAnonymousBookingToken,
} from "@/domain/booking-holds/anonymous-session";

function fingerprint(kind: "session" | "network", value: string) {
  return createHmac("sha256", getGuestAccessSigningSecret())
    .update(`booking-hold.${kind}.v1\0${value}`)
    .digest("hex");
}

function clientNetworkIdentity(values: Headers) {
  // Only consume an address header when the deployment platform is known to
  // overwrite it. Generic forwarded headers are caller-controlled on a direct
  // or incorrectly configured self-hosted deployment.
  const configuredHeader = process.env.BOOKING_HOLD_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (configuredHeader && !/^[a-z0-9-]{1,64}$/.test(configuredHeader)) {
    throw new Error("BOOKING_HOLD_TRUSTED_IP_HEADER is invalid.");
  }
  const configuredValue = configuredHeader ? values.get(configuredHeader) : null;
  const configuredAddress = configuredHeader === "x-forwarded-for"
    ? configuredValue?.split(",").at(-1)?.trim()
    : configuredValue?.trim();
  const address = configuredAddress || (process.env.VERCEL === "1"
    ? values.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    : process.env.CF_PAGES === "1"
      ? values.get("cf-connecting-ip")?.trim()
      : undefined);
  if (address) return address.slice(0, 128);

  return "unknown-network";
}

export type BookingHoldRequester = {
  sessionHash: string;
  networkHash: string;
};

export async function getBookingHoldRequester(): Promise<BookingHoldRequester> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(ANONYMOUS_BOOKING_COOKIE)?.value;
  const sessionToken = existingToken && ANONYMOUS_BOOKING_TOKEN_PATTERN.test(existingToken)
    ? existingToken
    : createAnonymousBookingToken();

  const networkIdentity = clientNetworkIdentity(await headers());
  return {
    sessionHash: fingerprint("session", sessionToken),
    networkHash: fingerprint("network", createHash("sha256").update(networkIdentity).digest("hex")),
  };
}
