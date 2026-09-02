export type NotificationEventType =
  | "booking_confirmation"
  | "arrival_reminder"
  | "berth_move_confirmation"
  | "cancellation_confirmation"
  | "payment_balance_reminder";

export type ClaimedNotification = {
  id: string;
  marina_id: string;
  booking_id: string | null;
  event_type: NotificationEventType;
  dedupe_key: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  text_body: string;
  attempt_count: number;
  lease_token: string;
};

export type DeliveryResult = { messageId: string };
export type NotificationTransport = (notification: ClaimedNotification) => Promise<DeliveryResult>;

export type NotificationBatchResult = {
  queuedArrivalReminders: number;
  claimed: number;
  sent: number;
  failed: number;
};
