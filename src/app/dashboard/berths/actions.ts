"use server";

import {
  createBerthAction as createBerth,
  updateBerthAction as updateBerth,
  updateBerthStatusAction as updateBerthStatus,
  type BerthActionState,
  type BerthStatusActionState,
} from "@/domain/berths/action-service";

export type {
  BerthActionState,
  BerthStatusActionState,
} from "@/domain/berths/action-service";

export async function createBerthAction(
  state: BerthActionState,
  formData: FormData,
) {
  return createBerth(state, formData);
}

export async function updateBerthAction(
  berthId: string,
  state: BerthActionState,
  formData: FormData,
) {
  return updateBerth(berthId, state, formData);
}

export async function updateBerthStatusAction(
  berthId: string,
  state: BerthStatusActionState,
  formData: FormData,
) {
  return updateBerthStatus(berthId, state, formData);
}
