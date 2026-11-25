import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

const verificationCookie = "m5-sentry-verification";

function matchesVerificationSecret(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false;

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const expectedSecret = process.env.SENTRY_VERIFICATION_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const suppliedSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!expectedSecret || !matchesVerificationSecret(suppliedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = Sentry.captureException(
    new Error("M5 controlled server observability verification"),
    {
      tags: { verification: "m5_sentry_server" },
      extra: { operation: "sentry_verification" },
    },
  );
  await Sentry.flush(3_000);

  const response = NextResponse.json({ eventId });
  response.cookies.set(verificationCookie, expectedSecret, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 300,
    path: "/monitoring/verification",
  });

  return response;
}

export const runtime = "nodejs";
