import { getCheckoutReturnStatus } from "@/domain/checkout/service";
import { validCheckoutSession } from "@/domain/checkout/confirmation";
import { createConfirmationPdf } from "@/domain/checkout/confirmation-pdf";
import { getPublicMarinaBySlug } from "@/domain/public-marinas/repository";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const sessions = new URL(request.url).searchParams.getAll("session_id");
  if (sessions.length !== 1 || !validCheckoutSession(sessions[0])) return new Response("Confirmation unavailable", { status: 404, headers: privateHeaders });
  const [payment, marina] = await Promise.all([
    getCheckoutReturnStatus(slug, sessions[0]),
    getPublicMarinaBySlug(createPublicClient(), slug),
  ]);
  if (!payment || !marina) return new Response("Confirmation unavailable", { status: 404, headers: privateHeaders });
  if (payment.status !== "paid" || !payment.confirmation) return new Response("A paid, active booking is required", { status: 409, headers: privateHeaders });
  const pdf = await createConfirmationPdf(payment, marina);
  return new Response(Buffer.from(pdf), { headers: {
    ...privateHeaders,
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="booking-${payment.confirmation.reference.replace(/[^a-zA-Z0-9_-]/g, "") || "confirmation"}.pdf"`,
  } });
}
