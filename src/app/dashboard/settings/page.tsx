import { Building2, ChevronRight, CircleDollarSign, Clock3, Globe2, PlugZap, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireMarinaMembership } from "@/lib/auth/session";
import shellStyles from "../overview.module.css";
import styles from "./settings-hub.module.css";

export const metadata = { title: "Settings" };

const destinations = [
  { title: "General", description: "Marina profile, contact details, website, and operational timezone.", href: "/dashboard/settings/general", icon: Building2 },
  { title: "Pricing", description: "Rates, seasonal pricing, mandatory fees, VAT, and billing currency.", href: "/dashboard/settings/pricing", icon: CircleDollarSign },
  { title: "Cancellation Policy", description: "Cancellation windows, refund rules, and booking cancellation policy.", href: "/dashboard/settings/cancellation-policy", icon: ShieldCheck },
  { title: "Integrations", description: "Stripe, email delivery, notification processing, and integration readiness.", href: "/dashboard/settings/integrations", icon: PlugZap },
  { title: "Publishing", description: "Public booking page status, readiness checks, and publishing controls.", href: "/dashboard/settings/publishing", icon: Globe2 },
  { title: "Audit Log", description: "Administrative, marina staff, and automated system activity history.", href: "/dashboard/audit", icon: Clock3 },
];

export default async function SettingsHubPage() {
  const context = await requireMarinaMembership("/dashboard/settings");
  if (context.role !== "marina_admin") notFound();

  return <AppShell context={context} title="Settings" description="Marina settings navigation" wide
    className={shellStyles.overview} activePage="settings"
    overviewHeader={<div className={styles.breadcrumb}><span>Admin</span><span aria-hidden="true">/</span><strong>Settings</strong></div>}>
    <header className={styles.heading}><h1>Settings</h1><p>Manage marina configuration, commercial rules, integrations, and administrative tools.</p></header>
    <nav className={styles.hub} aria-label="Settings sections">
      {destinations.map(({ title, description, href, icon: Icon }) => <Link className={styles.row} key={href} href={href} aria-labelledby={`settings-${title.replaceAll(" ", "-")}`}>
        <span className={styles.icon}><Icon size={25} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className={styles.copy}><strong id={`settings-${title.replaceAll(" ", "-")}`}>{title}</strong><span>{description}</span></span>
        <ChevronRight className={styles.chevron} size={22} strokeWidth={1.7} aria-hidden="true" />
      </Link>)}
    </nav>
    <footer className={styles.footer}>{context.marinaName}<span aria-hidden="true"> · </span>{context.timezone}</footer>
  </AppShell>;
}
