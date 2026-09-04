"use server";

import { updatePublicationStateAction as updatePublicationState } from "@/domain/public-page-publishing/action-service";
import type { PublicationActionState } from "@/domain/public-page-publishing/types";

export type { PublicationActionState } from "@/domain/public-page-publishing/types";

export async function updatePublicationStateAction(
  expectedUpdatedAt: string,
  state: PublicationActionState,
  formData: FormData,
) {
  return updatePublicationState(expectedUpdatedAt, state, formData);
}

