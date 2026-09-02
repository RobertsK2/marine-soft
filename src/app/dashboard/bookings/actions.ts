"use server";

import {
  assignBookingBerthAction as assignBookingBerth,
  confirmBookingExtensionAction as confirmBookingExtension,
  createBookingAction as createBooking,
  previewBookingExtensionAction as previewBookingExtension,
  transitionBookingStayAction as transitionBookingStay,
  updateBookingDetailsAction as updateBookingDetails,
  updateBookingPaymentStateAction as updateBookingPaymentState,
  updateBookingStatusAction as updateBookingStatus,
  type BerthAssignmentActionState,
  type BookingActionState,
  type BookingChangeActionState,
  type BookingExtensionActionState,
  type BookingPaymentActionState,
  type OperationalTransitionActionState,
} from "@/domain/bookings/action-service";

export type {
  BerthAssignmentActionState,
  BookingActionState,
  BookingChangeActionState,
  BookingExtensionActionState,
  BookingPaymentActionState,
  OperationalTransitionActionState,
} from "@/domain/bookings/action-service";

export async function createBookingAction(
  state: BookingActionState,
  formData: FormData,
) {
  return createBooking(state, formData);
}

export async function updateBookingPaymentStateAction(
  bookingId: string,
  state: BookingPaymentActionState,
  formData: FormData,
) {
  return updateBookingPaymentState(bookingId, state, formData);
}

export async function previewBookingExtensionAction(
  bookingId: string,
  expectedUpdatedAt: string,
  state: BookingExtensionActionState,
  formData: FormData,
) {
  return previewBookingExtension(bookingId, expectedUpdatedAt, state, formData);
}

export async function confirmBookingExtensionAction(
  bookingId: string,
  expectedUpdatedAt: string,
  state: BookingExtensionActionState,
  formData: FormData,
) {
  return confirmBookingExtension(bookingId, expectedUpdatedAt, state, formData);
}

export async function updateBookingDetailsAction(
  bookingId: string,
  expectedUpdatedAt: string,
  state: BookingChangeActionState,
  formData: FormData,
) {
  return updateBookingDetails(bookingId, expectedUpdatedAt, state, formData);
}

export async function updateBookingStatusAction(
  bookingId: string,
  expectedUpdatedAt: string,
  state: BookingActionState,
  formData: FormData,
) {
  return updateBookingStatus(bookingId, expectedUpdatedAt, state, formData);
}

export async function transitionBookingStayAction(
  bookingId: string,
  state: OperationalTransitionActionState,
  formData: FormData,
) {
  return transitionBookingStay(bookingId, state, formData);
}

export async function assignBookingBerthAction(
  bookingId: string,
  state: BerthAssignmentActionState,
  formData: FormData,
) {
  return assignBookingBerth(bookingId, state, formData);
}
