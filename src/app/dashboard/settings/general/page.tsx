import { notFound } from "next/navigation";
import Link from "next/link";
import { updateMarinaProfileAction } from "@/app/dashboard/settings/actions";
import { AppShell } from "@/components/app-shell";
import { MarinaProfileForm } from "@/components/marina-profile/marina-profile-form";
import { getMarinaProfile } from "@/domain/marina-profile/repository";
import { SUPPORTED_IANA_TIMEZONES } from "@/domain/marina-profile/validation";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import shellStyles from "../../overview.module.css";
import styles from "@/components/marina-profile/general-settings.module.css";

export const metadata = { title: "Marina settings" };

export default async function MarinaSettingsPage() {
  const context = await requireMarinaMembership("/dashboard/settings/general");
  if (context.role !== "marina_admin") notFound();

  const profile = await getMarinaProfile(await createClient(), context.marinaId);
  if (!profile) notFound();

  const action = updateMarinaProfileAction.bind(null, profile.updated_at);

  return (
    <AppShell
      activePage="settings"
      className={`${shellStyles.overview} ${styles.shell}`}
      context={context}
      description="Core marina identity, public contact details, and the timezone used by operational displays."
      title="Marina settings"
      overviewHeader={<div className={styles.breadcrumb}><Link href="/dashboard/settings">Settings</Link><span>/</span><strong>General</strong></div>}
    >
      <Link className={styles.back} href="/dashboard/settings">← Back to Settings</Link>
      <header className={styles.heading}><h1>General Settings</h1><p>Manage marina profile, contact details, website, and operational timezone.</p></header>
      <MarinaProfileForm
        action={action}
        profile={profile}
        timezones={SUPPORTED_IANA_TIMEZONES}
      />
    </AppShell>
  );
}
