import type { Database } from "@/types/database";

export type BerthAssignment = Database["public"]["Tables"]["booking_berth_assignments"]["Row"];

export type BerthAssignmentOption = {
  berthId: string;
  code: string;
  zone: string;
  maxLengthM: number;
  maxBeamM: number;
  maxDraftM: number;
  conflict: boolean;
};

export type BerthAssignmentHistoryItem = {
  id: string;
  berthId: string;
  berthCode: string;
  arrivalDate: string;
  departureDate: string;
  assignedAt: string;
  assignmentKind: "stay" | "planned_move";
  endedAt: string | null;
  endedReason: string | null;
};

export type BookingBerthAssignmentState = {
  current: BerthAssignmentHistoryItem | null;
  activeSegments: BerthAssignmentHistoryItem[];
  plannedMoves: BerthAssignmentHistoryItem[];
  history: BerthAssignmentHistoryItem[];
  options: BerthAssignmentOption[];
};

export type MapBookingAssignment = {
  bookingId: string;
  reference: string;
  status: Database["public"]["Enums"]["booking_status"];
  arrivalDate: string;
  departureDate: string;
  assignmentKind: "stay" | "planned_move";
};
