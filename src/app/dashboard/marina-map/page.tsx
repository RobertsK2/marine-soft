import { updateBerthStatusAction } from "@/app/dashboard/berths/actions";
import { AppShell } from "@/components/app-shell";
import { MarinaMap } from "@/components/marina-map/marina-map";
import { listBerths } from "@/domain/berths/repository";
import { mapBerthsToLayout } from "@/domain/marina-map/model";
import { PILOT_BERTH_LAYOUT } from "@/domain/marina-map/pilot-layout";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Marina map" };

export default async function MarinaMapPage() {
  const context = await requireMarinaMembership("/dashboard/marina-map");
  const supabase = await createClient();
  const berths = await listBerths(supabase, context.marinaId);
  const { mappedBerths, unmappedBerths } = mapBerthsToLayout(
    berths,
    PILOT_BERTH_LAYOUT,
  );

  return (
    <AppShell
      context={context}
      description="A Berthio-managed SVG connected directly to this marina's tenant-isolated berth records."
      title="Marina map"
      wide
    >
      <MarinaMap
        mappedBerths={mappedBerths}
        marinaName={context.marinaName}
        unmappedCount={unmappedBerths.length}
        updateStatusAction={context.role === "marina_admin" ? updateBerthStatusAction : undefined}
      />
    </AppShell>
  );
}
