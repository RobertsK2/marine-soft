import { updateBerthStatusAction } from "@/app/dashboard/berths/actions";
import { AppShell } from "@/components/app-shell";
import { MarinaMap } from "@/components/marina-map/marina-map";
import { listBerths } from "@/domain/berths/repository";
import { listBookings } from "@/domain/bookings/repository";
import { listBerthAssignments } from "@/domain/berth-assignments/repository";
import type { MapBookingAssignment } from "@/domain/berth-assignments/types";
import { mapBerthsToLayout } from "@/domain/marina-map/model";
import { PILOT_BERTH_LAYOUT } from "@/domain/marina-map/pilot-layout";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Marina map" };

export default async function MarinaMapPage() {
  const context = await requireMarinaMembership("/dashboard/marina-map");
  const supabase = await createClient();
  const [berths, bookings, assignments] = await Promise.all([
    listBerths(supabase, context.marinaId),
    listBookings(supabase, context.marinaId),
    listBerthAssignments(supabase, context.marinaId),
  ]);
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));
  const assignmentsByBerth = new Map<string, MapBookingAssignment[]>();
  for (const assignment of assignments.filter((item) => item.ended_at === null)) {
    const booking = bookingById.get(assignment.booking_id);
    if (!booking || !["confirmed", "checked_in"].includes(booking.status)) continue;
    const existing = assignmentsByBerth.get(assignment.berth_id) ?? [];
    existing.push({
      bookingId: booking.id,
      reference: booking.reference,
      status: booking.status,
      arrivalDate: assignment.arrival_date,
      departureDate: assignment.departure_date,
    });
    assignmentsByBerth.set(assignment.berth_id, existing);
  }
  const { mappedBerths, unmappedBerths } = mapBerthsToLayout(
    berths,
    PILOT_BERTH_LAYOUT,
    assignmentsByBerth,
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
