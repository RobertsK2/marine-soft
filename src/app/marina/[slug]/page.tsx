/* eslint-disable @next/next/no-img-element -- Marina-managed image URLs are intentionally unrestricted by a global Next image allowlist. */
import type { CSSProperties } from "react";
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { Anchor, ArrowDown, Clock3, Compass, ExternalLink, Mail, Phone } from "lucide-react";
import { notFound } from "next/navigation";
import { BookingSearchForm } from "@/components/public-booking/booking-search-form";
import {
  bookingSearchFormValues,
  hasBookingSearchParams,
  marinaDateKey,
  validatePublicBookingSearch,
} from "@/domain/public-booking/validation";
import { marinaInitials, timezoneLabel } from "@/domain/public-marinas/model";
import { getPublicMarinaBySlug } from "@/domain/public-marinas/repository";
import { getPublicAvailability } from "@/domain/public-availability/service";
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
      captureServerError(error, {
        marina_slug: marina.slug,
        operation: "public_availability_check",
      });
      availabilityError = "Please try again. No booking or berth assignment was created.";
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
      priceError = "Please try again. No booking, payment, or capacity hold was created.";
    }
  }
  const brandStyle: BrandedStyle = { "--marina-brand": marina.primaryColor };
  const localTimeZone = timezoneLabel(marina.timezone);
  const hasPublicContact = Boolean(
    marina.contactEmail || marina.contactPhone || marina.websiteUrl,
  );

  return (
    <main className="public-marina" style={brandStyle}>
      <header className="public-marina-header">
        <a className="public-marina-identity" href="#marina-overview" aria-label={`${marina.name} overview`}>
          {marina.logoUrl ? (
            <img alt={`${marina.name} logo`} src={marina.logoUrl} />
          ) : (
            <span aria-hidden="true">{marinaInitials(marina.name)}</span>
          )}
          <strong>{marina.name}</strong>
        </a>
        <a className="public-marina-header-cta" href="#booking-entry">
          Request a berth
        </a>
      </header>

      <section className={`public-marina-hero${marina.coverImageUrl ? " has-cover" : ""}`} id="marina-overview">
        {marina.coverImageUrl ? (
          <img alt={`${marina.name} harbour`} className="public-marina-cover" src={marina.coverImageUrl} />
        ) : null}
        <div className="public-marina-hero-grid">
          <div className="public-marina-hero-copy">
            <p className="public-marina-kicker"><Anchor size={14} /> Berth requests / {marina.slug}</p>
            <h1>{marina.name}</h1>
            <p className="public-marina-lede">
              {marina.publicText ?? "Plan your arrival and send the marina your berth requirements."}
            </p>
            <a className="button button-primary button-large" href="#booking-entry">
              Plan a berth stay <ArrowDown size={16} />
            </a>
          </div>

          <aside className="public-marina-instrument" aria-label="Marina local time context">
            <p>Harbour context</p>
            <dl>
              <div>
                <dt><Clock3 size={15} /> Local timezone</dt>
                <dd>{marina.timezone}</dd>
              </div>
              <div>
                <dt><Compass size={15} /> Time standard</dt>
                <dd>{localTimeZone}</dd>
              </div>
              <div>
                <dt><Anchor size={15} /> Booking channel</dt>
                <dd>Direct marina request</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      {marina.localText || hasPublicContact ? (
        <section
          className={`public-marina-details${marina.localText && hasPublicContact ? " has-two-columns" : ""}`}
          aria-label="Marina information"
        >
          {marina.localText ? (
            <article className="public-marina-local-note">
              <p className="public-marina-section-code">Local harbour note</p>
              <h2>{marina.localLanguage ?? "Local information"}</h2>
              <p lang={marina.localLanguage ? undefined : "en"}>{marina.localText}</p>
            </article>
          ) : null}
          {hasPublicContact ? (
            <address className="public-marina-contact">
              <p className="public-marina-section-code">Marina contact</p>
              <h2>Contact</h2>
              <ul>
                {marina.contactEmail ? (
                  <li><Mail size={16} aria-hidden="true" /><a href={`mailto:${marina.contactEmail}`}>{marina.contactEmail}</a></li>
                ) : null}
                {marina.contactPhone ? (
                  <li><Phone size={16} aria-hidden="true" /><a href={`tel:${marina.contactPhone}`}>{marina.contactPhone}</a></li>
                ) : null}
                {marina.websiteUrl ? (
                  <li><ExternalLink size={16} aria-hidden="true" /><a href={marina.websiteUrl}>Marina website</a></li>
                ) : null}
              </ul>
            </address>
          ) : null}
        </section>
      ) : null}

      <section className="public-marina-booking" id="booking-entry">
        <div>
          <p className="public-marina-section-code">Availability + pricing + hold / Phase 5</p>
          <h2>Request a berth</h2>
          <p>
            Enter the stay window and the vessel&apos;s safe maximum dimensions. Berthio checks real physical capacity without assigning a berth.
          </p>
          <dl className="public-booking-semantics">
            <div><dt>Stay model</dt><dd>[arrival, departure)</dd></div>
            <div><dt>Timezone</dt><dd>{marina.timezone}</dd></div>
            <div><dt>Booking created</dt><dd>No</dd></div>
          </dl>
        </div>
        <BookingSearchForm
          availability={availability}
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
          values={formValues}
        />
      </section>

      <footer className="public-marina-footer">
        <span>{marina.name}</span>
        <span>Hosted by Berthio</span>
      </footer>
    </main>
  );
}
