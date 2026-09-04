import { notFound } from "next/navigation";
import { updatePublicationStateAction } from "@/app/dashboard/settings/publishing/actions";
import { AppShell } from "@/components/app-shell";
import { PublicationPanel } from "@/components/public-page-publishing/publication-panel";
import { loadPublicationSettings } from "@/domain/public-page-publishing/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Public page publishing" };

export default async function PublicationSettingsPage() {
  const context = await requireMarinaMembership("/dashboard/settings/publishing");
  if (context.role !== "marina_admin") notFound();
  const settings = await loadPublicationSettings(await createClient(), context.marinaId);
  const action = updatePublicationStateAction.bind(null, settings.profile.updatedAt);

  return (
    <AppShell
      context={context}
      description="Control whether this marina's existing public booking page is available, after checking its required configuration."
      title="Public page publishing"
    >
      <PublicationPanel action={action} settings={settings} />
    </AppShell>
  );
}

