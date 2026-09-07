import { notFound } from "next/navigation";
import { updatePublicationStateAction } from "@/app/dashboard/settings/publishing/actions";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PublicationPanel } from "@/components/public-page-publishing/publication-panel";
import { loadPublicationSettings } from "@/domain/public-page-publishing/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import shellStyles from "../../overview.module.css";
import styles from "@/components/public-page-publishing/publishing-settings.module.css";

export const metadata = { title: "Publishing" };

export default async function PublicationSettingsPage() {
  const context = await requireMarinaMembership("/dashboard/settings/publishing");
  if (context.role !== "marina_admin") notFound();
  const settings = await loadPublicationSettings(await createClient(), context.marinaId);
  const action = updatePublicationStateAction.bind(null, settings.profile.updatedAt);

  return (
    <AppShell
      activePage="settings"
      className={`${shellStyles.overview} ${styles.shell}`}
      wide
      overviewHeader={<nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/dashboard/settings">Settings</Link><ChevronRight size={14} aria-hidden="true" /><strong aria-current="page">Publishing</strong></nav>}
      context={context}
      description="Control whether this marina's existing public booking page is available, after checking its required configuration."
      title="Publishing"
    >
      <Link className={styles.back} href="/dashboard/settings"><ArrowLeft size={14} aria-hidden="true" />Back to Settings</Link>
      <header className={styles.heading}><h1>Publishing</h1><p>Control your public booking page and review operational readiness before going live.</p></header>
      <PublicationPanel action={action} settings={settings} publicUrl={`${getSiteUrl()}/marina/${settings.profile.slug}`} />
    </AppShell>
  );
}
