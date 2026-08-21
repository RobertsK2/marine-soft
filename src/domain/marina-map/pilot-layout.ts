import type { PilotBerthPlacement } from "@/domain/marina-map/types";

/**
 * Berthio-managed geometry for the local Marina A pilot.
 *
 * Every slot is keyed directly by the immutable database berth UUID. Codes and
 * coordinates are presentation only and must never be used as record identity.
 */
export const PILOT_BERTH_LAYOUT = [
  { berthId: "d5000000-0000-4000-8000-000000000001", x: 230, y: 105, rotation: -12 },
  { berthId: "d5000000-0000-4000-8000-000000000002", x: 345, y: 105, rotation: -7 },
  { berthId: "d5000000-0000-4000-8000-000000000003", x: 460, y: 105, rotation: -2 },
  { berthId: "d5000000-0000-4000-8000-000000000004", x: 575, y: 105, rotation: 5 },
  { berthId: "d5000000-0000-4000-8000-000000000005", x: 255, y: 315, rotation: 8 },
  { berthId: "d5000000-0000-4000-8000-000000000006", x: 375, y: 315, rotation: 4 },
  { berthId: "d5000000-0000-4000-8000-000000000007", x: 500, y: 315, rotation: -4 },
  { berthId: "d5000000-0000-4000-8000-000000000008", x: 720, y: 215, rotation: 72 },
  { berthId: "d5000000-0000-4000-8000-000000000009", x: 755, y: 325, rotation: 72 },
  { berthId: "d5000000-0000-4000-8000-000000000010", x: 790, y: 435, rotation: 72 },
  { berthId: "d5000000-0000-4000-8000-000000000011", x: 825, y: 545, rotation: 72 },
  { berthId: "d5000000-0000-4000-8000-000000000012", x: 105, y: 360, rotation: -82 },
] as const satisfies readonly PilotBerthPlacement[];
