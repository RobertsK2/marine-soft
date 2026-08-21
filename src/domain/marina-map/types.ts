import type { Berth } from "@/domain/berths/types";

export type MapDisplayStatus = "available" | "unavailable";

export type PilotBerthPlacement = {
  berthId: string;
  x: number;
  y: number;
  rotation: number;
};

export type MappedBerth = {
  berth: Berth;
  displayStatus: MapDisplayStatus;
  placement: PilotBerthPlacement;
};
