import "server-only";
import { loadAvailabilitySnapshot } from "@/domain/availability/repository";
import type { AvailabilityRequest } from "@/domain/availability/types";
import type { PublicBookingSearch } from "@/domain/public-booking/types";
import { evaluatePublicAvailability } from "@/domain/public-availability/model";
import type { PublicAvailabilityResult } from "@/domain/public-availability/types";
import { createPrivilegedClient } from "@/lib/supabase/privileged";

export class PublicAvailabilityServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PublicAvailabilityServiceError";
  }
}

export async function getPublicAvailability(
  marinaSlug: string,
  search: PublicBookingSearch,
): Promise<PublicAvailabilityResult | null> {
  const supabase = createPrivilegedClient();
  const { data: marina, error } = await supabase
    .from("marinas")
    .select("id")
    .eq("slug", marinaSlug)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    throw new PublicAvailabilityServiceError("Unable to resolve public marina scope.", {
      cause: error,
    });
  }
  if (!marina) return null;

  const request: AvailabilityRequest = {
    marinaId: marina.id,
    arrivalDate: search.arrivalDate,
    departureDate: search.departureDate,
    vesselBeamM: search.vesselBeamM,
    vesselDraftM: search.vesselDraftM,
    vesselLengthM: search.vesselLengthM,
  };

  try {
    const { berths, bookings } = await loadAvailabilitySnapshot(supabase, request);
    return evaluatePublicAvailability(request, berths, bookings);
  } catch (snapshotError) {
    throw new PublicAvailabilityServiceError("Unable to evaluate public availability.", {
      cause: snapshotError,
    });
  }
}
