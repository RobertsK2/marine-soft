/* eslint-disable @next/next/no-img-element -- Marina-managed public images. */
import Link from "next/link";
import { Mail } from "lucide-react";
import { marinaInitials } from "@/domain/public-marinas/model";
import type { PublicMarina } from "@/domain/public-marinas/types";
import styles from "./guest-booking.module.css";

export function GuestHeader({ marina, overviewHref }: { marina: PublicMarina; overviewHref?: string }) {
  return <header className={styles.header}>
    <a className={styles.identity} href={overviewHref ?? `/marina/${encodeURIComponent(marina.slug)}`} aria-label={`${marina.name} overview`}>
      {marina.logoUrl ? <img alt={`${marina.name} logo`} src={marina.logoUrl} /> : <span aria-hidden="true">{marinaInitials(marina.name)}</span>}
      <strong>{marina.name}</strong>
    </a>
    <span className={styles.powered}>Powered by <strong>Berthio</strong></span>
  </header>;
}

export function GuestFooter({ marina }: { marina: PublicMarina }) {
  return <footer className={styles.footer}>
    <span>{marina.name}</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link>
    {marina.contactEmail ? <a href={`mailto:${marina.contactEmail}`}><Mail size={14} aria-hidden="true" /> Contact</a> : null}
    {marina.contactPhone ? <a href={`tel:${marina.contactPhone}`}>{marina.contactPhone}</a> : null}
    {marina.websiteUrl ? <a href={marina.websiteUrl}>Marina website</a> : null}
    <span className={styles.powered}>Powered by <strong>Berthio</strong></span>
  </footer>;
}
