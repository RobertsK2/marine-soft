import type { Berth } from "@/domain/berths/types";
import type { MapBookingAssignment } from "@/domain/berth-assignments/types";

export type MapDisplayStatus = "available" | "reserved" | "occupied" | "unavailable";

export type PilotBerthPlacement = {
  berthId: string;
  x: number;
  y: number;
  rotation: number;
};

export type MappedBerth = {
  berth: Berth;
  assignments: MapBookingAssignment[];
  displayStatus: MapDisplayStatus;
  placement: PilotBerthPlacement;
};
