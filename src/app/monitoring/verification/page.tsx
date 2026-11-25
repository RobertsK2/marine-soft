import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ClientVerification } from "./client-verification";

const verificationCookie = "m5-sentry-verification";

function matchesVerificationSecret(supplied: string | undefined, expected: string | undefined) {
  if (!supplied || !expected) return false;

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export default async function SentryVerificationPage() {
  const expectedSecret = process.env.SENTRY_VERIFICATION_SECRET?.trim();
  const suppliedSecret = (await cookies()).get(verificationCookie)?.value;

  if (!matchesVerificationSecret(suppliedSecret, expectedSecret)) notFound();

  return (
    <main>
      <h1>Observability verification</h1>
      <ClientVerification />
    </main>
  );
}
