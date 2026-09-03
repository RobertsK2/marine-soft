"use server";

import {
  updateMarinaProfileAction as updateMarinaProfile,
} from "@/domain/marina-profile/action-service";
import type { MarinaProfileActionState } from "@/domain/marina-profile/types";

export type { MarinaProfileActionState } from "@/domain/marina-profile/types";

export async function updateMarinaProfileAction(
  expectedUpdatedAt: string,
  state: MarinaProfileActionState,
  formData: FormData,
) {
  return updateMarinaProfile(expectedUpdatedAt, state, formData);
}
