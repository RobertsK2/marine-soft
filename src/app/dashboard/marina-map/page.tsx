import { updateBerthStatusAction } from "@/app/dashboard/berths/actions";
import { AppShell } from "@/components/app-shell";
import { BerthMapWorkspace } from "@/components/marina-map/berth-map-workspace";
import { listBerths } from "@/domain/berths/repository";
import { listBookings } from "@/domain/bookings/repository";
import { listBerthAssignments } from "@/domain/berth-assignments/repository";
import type { MapBookingAssignment } from "@/domain/berth-assignments/types";
import { deriveMapDisplayStatus, mapBerthsToLayout } from "@/domain/marina-map/model";
import { PILOT_BERTH_LAYOUT } from "@/domain/marina-map/pilot-layout";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CalendarDays } from "lucide-react";
import shellStyles from "../overview.module.css";

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
      assignmentKind: assignment.assignment_kind,
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
      className={shellStyles.overview}
      activePage="map"
      overviewHeader={<header className={shellStyles.topbar}>
        <div><h1>Marina map</h1><p>{context.marinaName}</p></div>
        <div className={shellStyles.date}><CalendarDays size={18} aria-hidden="true" /><div>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: context.timezone }).format(new Date())}<small>{context.timezone}</small></div></div>
      </header>}
      context={context}
      description="A Berthio-managed SVG connected directly to this marina's tenant-isolated berth records."
      title="Marina map"
      wide
    >
      <BerthMapWorkspace
        statuses={berths.map((berth) => deriveMapDisplayStatus(berth, assignmentsByBerth.get(berth.id)))}
        mappedBerths={mappedBerths}
        marinaName={context.marinaName}
        unmappedCount={unmappedBerths.length}
        updateStatusAction={context.role === "marina_admin" ? updateBerthStatusAction : undefined}
      />
    </AppShell>
  );
}
