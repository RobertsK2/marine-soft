import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCheckoutReturnStatus } from "@/domain/checkout/service";
import { validCheckoutSession } from "@/domain/checkout/confirmation";
import { getPublicMarinaBySlug } from "@/domain/public-marinas/repository";
import { createPublicClient } from "@/lib/supabase/public";
import { BookingConfirmation } from "@/components/public-booking/booking-confirmation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Booking confirmation",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function CheckoutReturnPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { slug } = await params;
  const sessionId = (await searchParams).session_id;
  if (!validCheckoutSession(sessionId)) notFound();
  const [payment, marina] = await Promise.all([
    getCheckoutReturnStatus(slug, sessionId),
    getPublicMarinaBySlug(createPublicClient(), slug),
  ]);
  if (!payment || !marina) notFound();
  return <BookingConfirmation payment={payment} marina={marina} sessionId={sessionId} />;
}
