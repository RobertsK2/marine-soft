import { berthFitsVessel, intervalsOverlap } from "@/domain/availability/matching";
import type { Berth } from "@/domain/berths/types";
import type { Booking } from "@/domain/bookings/types";
import type {
  BerthAssignment,
  BookingBerthAssignmentState,
} from "@/domain/berth-assignments/types";

export function buildBookingBerthAssignmentState(
  booking: Booking,
  berths: Berth[],
  assignments: BerthAssignment[],
): BookingBerthAssignmentState {
  const berthById = new Map(berths.map((berth) => [berth.id, berth]));
  const activeAssignments = assignments.filter((assignment) => assignment.ended_at === null);
  const history = assignments
    .filter((assignment) => assignment.booking_id === booking.id)
    .map((assignment) => ({
      id: assignment.id,
      berthId: assignment.berth_id,
      berthCode: berthById.get(assignment.berth_id)?.code ?? "Unknown berth",
      arrivalDate: assignment.arrival_date,
      departureDate: assignment.departure_date,
      assignedAt: assignment.assigned_at,
      endedAt: assignment.ended_at,
    }))
    .sort((left, right) => right.assignedAt.localeCompare(left.assignedAt));

  const options = berths
    .filter((berth) => berth.marina_id === booking.marina_id)
    .filter((berth) => berthFitsVessel({
      id: berth.id,
      marinaId: berth.marina_id,
      code: berth.code,
      priority: berth.priority,
      status: berth.status,
      allowSmallerVessels: berth.allow_smaller_vessels,
      maxLengthM: berth.max_length_m,
      maxBeamM: berth.max_beam_m,
      maxDraftM: berth.max_draft_m,
    }, {
      vesselLengthM: booking.vessel_length_m,
      vesselBeamM: booking.vessel_beam_m,
      vesselDraftM: booking.vessel_draft_m,
    }))
    .map((berth) => ({
      berthId: berth.id,
      code: berth.code,
      zone: berth.zone,
      maxLengthM: berth.max_length_m,
      maxBeamM: berth.max_beam_m,
      maxDraftM: berth.max_draft_m,
      conflict: activeAssignments.some((assignment) =>
        assignment.berth_id === berth.id
        && assignment.booking_id !== booking.id
        && intervalsOverlap(
          { arrivalDate: booking.arrival_date, departureDate: booking.departure_date },
          { arrivalDate: assignment.arrival_date, departureDate: assignment.departure_date },
        )),
    }))
    .sort((left, right) =>
      Number(left.conflict) - Number(right.conflict)
      || left.maxLengthM - right.maxLengthM
      || left.code.localeCompare(right.code));

  return { current: history.find((item) => item.endedAt === null) ?? null, history, options };
}
