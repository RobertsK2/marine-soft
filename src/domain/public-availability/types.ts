export type PublicAvailabilityResult =
  | { available: true }
  | {
      available: false;
      reason: "no_suitable_berth" | "capacity_full";
    };
