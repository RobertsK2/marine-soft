import { revalidatePath } from "next/cache";
import { integrationsAllowPublishing } from "@/domain/public-page-publishing/model";
import { loadPublicationSettings } from "@/domain/public-page-publishing/repository";
import type { PublicationActionState } from "@/domain/public-page-publishing/types";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { createClient } from "@/lib/supabase/server";

export async function updatePublicationStateAction(
  expectedUpdatedAt: string,
  _state: PublicationActionState,
  formData: FormData,
): Promise<PublicationActionState> {
  const context = await getAuthorizationContext();
  if (context?.role !== "marina_admin") {
    return { status: "error", message: "Marina admin access is required." };
  }
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
    return { status: "error", message: "The publication version is invalid. Refresh and try again." };
  }

  const requestedState = formData.get("publicationState");
  if (requestedState !== "publish" && requestedState !== "unpublish") {
    return { status: "error", message: "Choose a valid publication action." };
  }
  const requestedPublic = requestedState === "publish";

  try {
    const integrationsReady = requestedPublic
      ? integrationsAllowPublishing(
          (await loadPublicationSettings(await createClient(), context.marinaId)).integrations,
        )
      : false;
    const { data, error } = await createPrivilegedClient().rpc("set_marina_publication_state", {
      target_marina_id: context.marinaId,
      target_actor_id: context.userId,
      expected_updated_at: expectedUpdatedAt,
      requested_public: requestedPublic,
      integrations_ready: integrationsReady,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("Publication mutation returned no result.");
    if (result.outcome === "conflict") {
      return { status: "error", message: "Publication settings changed after this page was opened. Refresh and try again." };
    }
    if (result.outcome === "not_ready") {
      const labels = (result.blockers ?? []).map((blocker) => {
        if (blocker === "profile") return "public marina profile";
        if (blocker === "pricing") return "booking pricing";
        return "integration readiness";
      });
      return {
        status: "error",
        message: `Publishing is blocked. Complete: ${labels.join(", ")}.`,
      };
    }

    revalidatePath("/dashboard/settings/publishing");
    revalidatePath(`/marina/${context.marinaSlug}`);
    return {
      status: "success",
      message: requestedPublic
        ? "Public booking page published."
        : "Public booking page unpublished. Existing bookings and financial history were not changed.",
    };
  } catch (error) {
    captureServerError(error, { operation: "marina_publication_mutation", marinaId: context.marinaId });
    return { status: "error", message: "The publication state could not be changed. Refresh and try again." };
  }
}
