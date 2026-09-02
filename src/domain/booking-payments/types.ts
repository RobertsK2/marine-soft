import type { Database } from "@/types/database";

export type BookingPaymentBalance = Database["public"]["Tables"]["booking_payment_balances"]["Row"] & {
  overdue: boolean;
};
