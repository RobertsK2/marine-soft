import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { IntegrationStatusPanel } from "@/components/integration-status/integration-status-panel";
import { loadIntegrationStatus } from "@/domain/integration-status/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Integration status" };

export default async function IntegrationStatusPage() {
  const context = await requireMarinaMembership("/dashboard/settings/integrations");
  if (context.role !== "marina_admin") notFound();
  const status = await loadIntegrationStatus(await createClient(), context.marinaId);

  return (
    <AppShell context={context} description="Read-only readiness and operational signals for Stripe Connect and Postmark delivery." title="Integration status" wide>
      <IntegrationStatusPanel status={status} timezone={context.timezone} />
    </AppShell>
  );
}
