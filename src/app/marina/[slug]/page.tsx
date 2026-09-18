/* eslint-disable @next/next/no-img-element -- Marina-managed image URLs are intentionally unrestricted by a global Next image allowlist. */
import type { CSSProperties } from "react";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { Anchor, Clock3, LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";
import styles from "@/components/public-booking/guest-booking.module.css";
import { notFound } from "next/navigation";
import { BookingSearchForm } from "@/components/public-booking/booking-search-form";
import {
  bookingSearchFormValues,
  hasBookingSearchParams,
  marinaDateKey,
  validatePublicBookingSearch,
} from "@/domain/public-booking/validation";
import { marinaInitials } from "@/domain/public-marinas/model";
import { getPublicMarinaBySlug } from "@/domain/public-marinas/repository";
import { getPublicAvailability, PublicAvailabilityRateLimitError } from "@/domain/public-availability/service";
import type { PublicAvailabilityResult } from "@/domain/public-availability/types";
import { getPublicPriceQuote } from "@/domain/pricing/service";
import type { PublicPriceQuote } from "@/domain/pricing/types";
import { captureServerError } from "@/lib/monitoring/server";
import { createPublicClient } from "@/lib/supabase/public";

type MarinaParams = { params: Promise<{ slug: string }> };
type MarinaPageProps = MarinaParams & {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
type BrandedStyle = CSSProperties & { "--marina-brand": string };

async function loadMarina(slug: string) {
  return getPublicMarinaBySlug(createPublicClient(), slug);
}

export async function generateMetadata({ params }: MarinaParams): Promise<Metadata> {
  const marina = await loadMarina((await params).slug);
  if (!marina) return { title: "Marina not found" };

  return {
    title: marina.name,
    description: marina.publicText ?? `Plan a berth stay at ${marina.name}.`,
  };
}

export default async function PublicMarinaPage({ params, searchParams }: MarinaPageProps) {
  const marina = await loadMarina((await params).slug);
  if (!marina) notFound();

  const query = await searchParams;
  const formValues = bookingSearchFormValues(query);
  const submitted = hasBookingSearchParams(query);
  const validation = submitted
    ? validatePublicBookingSearch(query, marina.timezone)
    : null;
  const minArrivalDate = marinaDateKey(new Date(), marina.timezone) ?? "";
  const errors = validation && !validation.success ? validation.errors : {};
  const formError = validation && !validation.success ? validation.formError : undefined;
  const searchRequest = validation?.success ? validation.data : null;
  let availability: PublicAvailabilityResult | null = null;
  let availabilityError: string | undefined;
  let priceQuote: PublicPriceQuote | null = null;
  let priceError: string | undefined;

  if (searchRequest) {
    try {
      availability = await getPublicAvailability(marina.slug, searchRequest);
      if (!availability) availabilityError = "The marina is not available for public booking.";
    } catch (error) {
      if (error instanceof PublicAvailabilityRateLimitError) {
        console.warn("Public availability rate limit reached", { marina_slug: marina.slug });
        availabilityError = "Too many availability checks. Please try again shortly.";
      } else {
        captureServerError(error, {
          marina_slug: marina.slug,
          operation: "public_availability_check",
        });
        availabilityError = "Please try again. No booking or berth assignment was created.";
      }
    }
  }
  if (searchRequest && availability?.available) {
    try {
      priceQuote = await getPublicPriceQuote(marina.slug, searchRequest);
      if (!priceQuote) priceError = "Pricing is not configured for these dates.";
    } catch (error) {
      captureServerError(error, {
        marina_slug: marina.slug,
        operation: "public_price_quote",
      });
      priceError = "Pricing could not be loaded. Please check availability again.";
    }
  }
  const brandStyle: BrandedStyle = { "--marina-brand": marina.primaryColor };

  return (
    <main className={styles.page} style={brandStyle}>
      <header className={styles.header}>
        <a className={styles.identity} href="#marina-overview" aria-label={`${marina.name} overview`}>
          {marina.logoUrl ? <img alt={`${marina.name} logo`} src={marina.logoUrl} /> : <span aria-hidden="true">{marinaInitials(marina.name)}</span>}
          <strong>{marina.name}</strong>
        </a>
        <span className={styles.powered}>Powered by <strong>Berthio</strong></span>
      </header>
      <div className={styles.content}>
        <section className={`${styles.hero} ${marina.coverImageUrl ? styles.hasCover : ""}`} id="marina-overview">
          {marina.coverImageUrl ? <img alt={`${marina.name} harbour`} src={marina.coverImageUrl} /> : null}
          <div><h1>Book your stay at {marina.name}</h1><p>Find suitable berth capacity for your vessel and dates.</p></div>
        </section>
        <section id="booking-entry" aria-label="Booking search">
        <BookingSearchForm
          key={JSON.stringify(query)}
          availability={availability}
          acceptsOnlinePayment={marina.acceptsOnlinePayment}
          acceptsPayAtMarina={marina.acceptsPayAtMarina}
          availabilityError={availabilityError}
          errors={errors}
          formError={formError}
          holdIdempotencyKey={randomUUID()}
          marinaName={marina.name}
          marinaSlug={marina.slug}
          marinaTimezone={marina.timezone}
          minArrivalDate={minArrivalDate}
          priceError={priceError}
          priceQuote={priceQuote}
          request={searchRequest}
          resultAttempt={typeof query.searchAttempt === "string" ? query.searchAttempt : undefined}
          values={formValues}
        />
        </section>
        <div className={styles.trust} aria-label="Booking information">
          <span><Anchor size={16} aria-hidden="true" /> Check suitable capacity before booking; berth assigned by the marina</span>
          <span><Clock3 size={16} aria-hidden="true" /> Arrival times in {marina.timezone}</span>
          <span><LockKeyhole size={16} aria-hidden="true" /> {marina.acceptsOnlinePayment && !marina.acceptsPayAtMarina ? "Secure online checkout with Stripe" : marina.acceptsPayAtMarina && !marina.acceptsOnlinePayment ? "Pay at the marina after booking" : "Choose how to pay when you review your booking"}</span>
        </div>
        {(marina.publicText || marina.localText) ? <details className={styles.marinaInfo}><summary>About {marina.name}</summary>{marina.publicText ? <p>{marina.publicText}</p> : null}{marina.localText ? <p>{marina.localText}</p> : null}</details> : null}
      </div>
      <footer className={styles.footer}>
        <span>{marina.name}</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>
        {marina.contactEmail ? <a href={`mailto:${marina.contactEmail}`}><Mail size={14} aria-hidden="true" /> Contact</a> : null}
        {marina.contactPhone ? <a href={`tel:${marina.contactPhone}`}>{marina.contactPhone}</a> : null}
        {marina.websiteUrl ? <a href={marina.websiteUrl}>Marina website</a> : null}
        <span className={styles.powered}>Powered by <strong>Berthio</strong></span>
      </footer>
    </main>
  );
}
