import { notFound } from "next/navigation";
import { updateMarinaProfileAction } from "@/app/dashboard/settings/actions";
import { AppShell } from "@/components/app-shell";
import { MarinaProfileForm } from "@/components/marina-profile/marina-profile-form";
import { getMarinaProfile } from "@/domain/marina-profile/repository";
import { SUPPORTED_IANA_TIMEZONES } from "@/domain/marina-profile/validation";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Marina settings" };

export default async function MarinaSettingsPage() {
  const context = await requireMarinaMembership("/dashboard/settings");
  if (context.role !== "marina_admin") notFound();

  const profile = await getMarinaProfile(await createClient(), context.marinaId);
  if (!profile) notFound();

  const action = updateMarinaProfileAction.bind(null, profile.updated_at);

  return (
    <AppShell
      context={context}
      description="Core marina identity, public contact details, and the timezone used by operational displays."
      title="Marina settings"
    >
      <MarinaProfileForm
        action={action}
        profile={profile}
        timezones={SUPPORTED_IANA_TIMEZONES}
      />
    </AppShell>
  );
}
