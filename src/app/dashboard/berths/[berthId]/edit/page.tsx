import { notFound } from "next/navigation";
import { updateBerthAction } from "@/app/dashboard/berths/actions";
import { AppShell } from "@/components/app-shell";
import { BerthForm } from "@/components/berths/berth-form";
import { getBerth } from "@/domain/berths/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function EditBerthPage({
  params,
}: {
  params: Promise<{ berthId: string }>;
}) {
  const { berthId } = await params;
  const context = await requireMarinaMembership(`/dashboard/berths/${berthId}/edit`);
  if (context.role !== "marina_admin") notFound();

  const supabase = await createClient();
  const berth = await getBerth(supabase, context.marinaId, berthId);
  if (!berth) notFound();
  const action = updateBerthAction.bind(null, berth.id);

  return (
    <AppShell
      context={context}
      description="Update physical limits, assignment priority, zone, and operating status."
      title={`Edit ${berth.code}`}
      wide
    >
      <BerthForm
        action={action}
        berth={berth}
        cancelHref={`/dashboard/berths/${berth.id}`}
      />
    </AppShell>
  );
}
