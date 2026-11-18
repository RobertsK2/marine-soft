export type BookingSort = "newest" | "arrival";

export function parseBookingSort(value: unknown): BookingSort {
  return value === "arrival" ? "arrival" : "newest";
}
