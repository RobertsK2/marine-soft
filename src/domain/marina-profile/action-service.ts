import { revalidatePath } from "next/cache";
import {
  MarinaProfileRepositoryError,
  updateMarinaProfile,
} from "@/domain/marina-profile/repository";
import type { MarinaProfileActionState } from "@/domain/marina-profile/types";
import { validateMarinaProfileInput } from "@/domain/marina-profile/validation";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

function formValues(formData: FormData) {
  return {
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    localLanguage: formData.get("localLanguage"),
    name: formData.get("name"),
    publicDescription: formData.get("publicDescription"),
    publicDescriptionLocal: formData.get("publicDescriptionLocal"),
    timezone: formData.get("timezone"),
    websiteUrl: formData.get("websiteUrl"),
  };
}

export async function updateMarinaProfileAction(
  expectedUpdatedAt: string,
  _state: MarinaProfileActionState,
  formData: FormData,
): Promise<MarinaProfileActionState> {
  const context = await getAuthorizationContext();
  if (context?.role !== "marina_admin") {
    return { status: "error", message: "Marina admin access is required." };
  }

  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
    return { status: "error", message: "The profile version is invalid. Refresh and try again." };
  }

  const validation = validateMarinaProfileInput(formValues(formData));
  if (!validation.success) {
    return { status: "error", fieldErrors: validation.errors };
  }

  try {
    const result = await updateMarinaProfile(
      await createClient(),
      context.marinaId,
      expectedUpdatedAt,
      validation.data,
    );
    if (result.status === "conflict") {
      return {
        status: "error",
        message: "This profile changed after the page was opened. Refresh before saving again.",
      };
    }
  } catch (error) {
    captureServerError(error, { operation: "marina_profile_mutation" });
    const invalidDatabaseValue =
      error instanceof MarinaProfileRepositoryError && error.code === "23514";
    return {
      status: "error",
      message: invalidDatabaseValue
        ? "One or more profile values are not supported. Review the form and try again."
        : "Marina profile changes could not be saved. Try again.",
    };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/marina/${context.marinaSlug}`);
  return { status: "success", message: "Marina profile updated." };
}
