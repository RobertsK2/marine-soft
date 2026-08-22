/* eslint-disable @next/next/no-img-element -- Marina-managed image URLs are intentionally unrestricted by a global Next image allowlist. */
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Anchor, ArrowDown, Clock3, Compass, Map } from "lucide-react";
import { notFound } from "next/navigation";
import { marinaInitials, timezoneLabel } from "@/domain/public-marinas/model";
import { getPublicMarinaBySlug } from "@/domain/public-marinas/repository";
import { createPublicClient } from "@/lib/supabase/public";

type MarinaPageProps = { params: Promise<{ slug: string }> };
type BrandedStyle = CSSProperties & { "--marina-brand": string };

async function loadMarina(slug: string) {
  return getPublicMarinaBySlug(createPublicClient(), slug);
}

export async function generateMetadata({ params }: MarinaPageProps): Promise<Metadata> {
  const marina = await loadMarina((await params).slug);
  if (!marina) return { title: "Marina not found" };

  return {
    title: marina.name,
    description: marina.publicText ?? `Plan a berth stay at ${marina.name}.`,
  };
}

export default async function PublicMarinaPage({ params }: MarinaPageProps) {
  const marina = await loadMarina((await params).slug);
  if (!marina) notFound();

  const brandStyle: BrandedStyle = { "--marina-brand": marina.primaryColor };
  const localTimeZone = timezoneLabel(marina.timezone);

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

      {(marina.localText || marina.mapImageUrl) ? (
        <section className="public-marina-details" aria-label="Marina information">
          {marina.localText ? (
            <article className="public-marina-local-note">
              <p className="public-marina-section-code">Local harbour note</p>
              <h2>{marina.localLanguage ?? "Local information"}</h2>
              <p lang={marina.localLanguage ? undefined : "en"}>{marina.localText}</p>
            </article>
          ) : null}

          {marina.mapImageUrl ? (
            <figure className="public-marina-map-preview">
              <figcaption><Map size={15} /> Public marina map preview</figcaption>
              <img alt={`${marina.name} marina map preview`} src={marina.mapImageUrl} />
            </figure>
          ) : null}
        </section>
      ) : null}

      <section className="public-marina-booking" id="booking-entry">
        <div>
          <p className="public-marina-section-code">Booking entry / Phase 1</p>
          <h2>Request a berth</h2>
          <p>
            Start here to plan a direct stay with {marina.name}. Dates and vessel details are the next step in the booking flow.
          </p>
        </div>
        <ol aria-label="Booking details coming next">
          <li><span>01</span><strong>Stay dates</strong><small>Arrival and departure</small></li>
          <li><span>02</span><strong>Vessel dimensions</strong><small>Length, beam, and draft</small></li>
          <li><span>03</span><strong>Marina response</strong><small>Availability follows later in the booking flow</small></li>
        </ol>
      </section>

      <footer className="public-marina-footer">
        <span>{marina.name}</span>
        <span>Hosted by Berthio</span>
      </footer>
    </main>
  );
}
