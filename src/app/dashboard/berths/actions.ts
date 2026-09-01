"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BerthRepositoryError,
  createBerth,
  updateBerth,
  updateBerthStatus,
} from "@/domain/berths/repository";
import {
  BERTH_STATUSES,
  type BerthFieldErrors,
  type BerthStatus,
} from "@/domain/berths/types";
import { validateBerthInput } from "@/domain/berths/validation";
import { parseBerthImpactBookings } from "@/domain/berth-impact/model";
import type { BerthImpactPreview } from "@/domain/berth-impact/types";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { createClient } from "@/lib/supabase/server";

export type BerthActionState = {
  status: "idle" | "impact" | "error";
  message?: string;
  fieldErrors?: BerthFieldErrors;
  impact?: BerthImpactPreview;
};

export type BerthStatusActionState = {
  status: "idle" | "impact" | "success" | "error";
  message?: string;
  impact?: BerthImpactPreview;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formValues(formData: FormData) {
  return {
    code: formData.get("code"),
    zone: formData.get("zone"),
    maxLengthM: formData.get("maxLengthM"),
    maxBeamM: formData.get("maxBeamM"),
    maxDraftM: formData.get("maxDraftM"),
    priority: formData.get("priority"),
    status: formData.get("status"),
    allowSmallerVessels: formData.get("allowSmallerVessels"),
  };
}

async function marinaAdminContext() {
  const context = await getAuthorizationContext();
  return context?.role === "marina_admin" ? context : null;
}

async function previewBlockedBerthImpact(
  marinaId: string,
  berthId: string,
  actorId: string,
  requestedStatus: BerthStatus,
): Promise<BerthImpactPreview | null> {
  if (requestedStatus === "available") return null;
  const { data, error } = await createPrivilegedClient()
    .rpc("preview_berth_block_impact", {
      target_marina_id: marinaId,
      target_berth_id: berthId,
      target_actor_id: actorId,
      target_status: requestedStatus,
    });
  if (error) throw error;
  const result = data?.[0];
  if (!result || result.outcome === "not_found") return null;
  if (result.outcome === "unauthorized") throw new Error("Unauthorized berth impact preview.");
  return {
    berthCode: result.berth_code ?? "Unknown berth",
    requestedStatus,
    affectedCount: result.affected_count,
    unresolvedCount: result.unresolved_count,
    affectedBookings: parseBerthImpactBookings(result.affected_bookings),
  };
}

function impactMessage(impact: BerthImpactPreview) {
  return `${impact.affectedCount} active or upcoming booking${impact.affectedCount === 1 ? " is" : "s are"} assigned to this berth. Review alternatives before confirming the outage; no booking will be reassigned or notified automatically.`;
}

function repositoryFailure(error: unknown): BerthActionState {
  captureServerError(error, { operation: "berth_mutation" });
  if (error instanceof BerthRepositoryError && error.code === "23505") {
    return {
      status: "error",
      fieldErrors: { code: "That berth code already exists in this marina." },
    };
  }
  return {
    status: "error",
    message: "Berth changes could not be saved. Review the values and try again.",
  };
}

export async function createBerthAction(
  _state: BerthActionState,
  formData: FormData,
): Promise<BerthActionState> {
  const validation = validateBerthInput(formValues(formData));
  if (!validation.success) {
    return { status: "error", fieldErrors: validation.errors };
  }

  const context = await marinaAdminContext();
  if (!context) {
    return { status: "error", message: "Marina admin access is required." };
  }

  let berthId: string;
  try {
    const supabase = await createClient();
    berthId = await createBerth(supabase, context.marinaId, validation.data);
  } catch (error) {
    return repositoryFailure(error);
  }

  revalidatePath("/dashboard/berths");
  redirect(`/dashboard/berths/${berthId}`);
}

export async function updateBerthAction(
  berthId: string,
  _state: BerthActionState,
  formData: FormData,
): Promise<BerthActionState> {
  if (!UUID_PATTERN.test(berthId)) {
    return { status: "error", message: "The berth reference is invalid." };
  }

  const validation = validateBerthInput(formValues(formData));
  if (!validation.success) {
    return { status: "error", fieldErrors: validation.errors };
  }

  const context = await marinaAdminContext();
  if (!context) {
    return { status: "error", message: "Marina admin access is required." };
  }

  const requestedStatus = validation.data.status;
  if (requestedStatus !== "available" && formData.get("confirmImpact") !== "true") {
    try {
      const impact = await previewBlockedBerthImpact(context.marinaId, berthId, context.userId, requestedStatus);
      if (impact && impact.affectedCount > 0) return { status: "impact", message: impactMessage(impact), impact };
    } catch (error) {
      captureServerError(error, { operation: "berth_impact_preview", berthId });
      return { status: "error", message: "The berth impact could not be checked. Status was not changed." };
    }
  }

  try {
    const supabase = await createClient();
    const updated = await updateBerth(
      supabase,
      context.marinaId,
      berthId,
      validation.data,
    );
    if (!updated) {
      return { status: "error", message: "Berth not found or not editable." };
    }
  } catch (error) {
    return repositoryFailure(error);
  }

  revalidatePath("/dashboard/berths");
  revalidatePath(`/dashboard/berths/${berthId}`);
  redirect(`/dashboard/berths/${berthId}`);
}

export async function updateBerthStatusAction(
  berthId: string,
  _state: BerthStatusActionState,
  formData: FormData,
): Promise<BerthStatusActionState> {
  if (!UUID_PATTERN.test(berthId)) {
    return { status: "error", message: "The berth reference is invalid." };
  }

  const status = formData.get("status");
  if (
    typeof status !== "string" ||
    !BERTH_STATUSES.includes(status as BerthStatus)
  ) {
    return { status: "error", message: "Choose a valid operational status." };
  }

  const context = await marinaAdminContext();
  if (!context) {
    return { status: "error", message: "Marina admin access is required." };
  }

  if (status !== "available" && formData.get("confirmImpact") !== "true") {
    try {
      const impact = await previewBlockedBerthImpact(context.marinaId, berthId, context.userId, status as BerthStatus);
      if (impact && impact.affectedCount > 0) return { status: "impact", message: impactMessage(impact), impact };
    } catch (error) {
      captureServerError(error, { operation: "berth_impact_preview", berthId });
      return { status: "error", message: "The berth impact could not be checked. Status was not changed." };
    }
  }

  try {
    const supabase = await createClient();
    const updated = await updateBerthStatus(
      supabase,
      context.marinaId,
      berthId,
      status as BerthStatus,
    );
    if (!updated) {
      return { status: "error", message: "Berth not found or not editable." };
    }
  } catch (error) {
    captureServerError(error, { operation: "berth_status_mutation" });
    return { status: "error", message: "Berth status could not be saved." };
  }

  revalidatePath("/dashboard/marina-map");
  revalidatePath("/dashboard/berths");
  revalidatePath(`/dashboard/berths/${berthId}`);
  return { status: "success", message: "Operational status updated." };
}
