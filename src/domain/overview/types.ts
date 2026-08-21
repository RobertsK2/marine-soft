import type { BookingStatus } from "@/domain/bookings/types";

export type OverviewBooking = {
  arrival_date: string;
  created_at: string;
  customer_name: string;
  departure_date: string;
  eta: string;
  etd: string;
  id: string;
  reference: string;
  status: BookingStatus;
  vessel_name: string | null;
};

export type OverviewMetrics = {
  activeStayCount: number;
  arrivalsToday: number;
  departuresToday: number;
  occupancyPercent: number | null;
  operationalBerthCount: number;
};

export type OverviewActivity = {
  bookingId: string;
  context: string;
  event: "Arrival" | "Booking created" | "Departure";
  id: string;
  reference: string;
  sortTime: string;
  status: BookingStatus;
  time: string;
};
