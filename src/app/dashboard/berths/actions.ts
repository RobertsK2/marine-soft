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
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

export type BerthActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: BerthFieldErrors;
};

export type BerthStatusActionState = {
  status: "idle" | "success" | "error";
  message?: string;
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
