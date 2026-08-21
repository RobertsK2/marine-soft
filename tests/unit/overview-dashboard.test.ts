import { describe, expect, it } from "vitest";
import { deriveOverviewMetrics, deriveTodaysActivity, marinaDateKey } from "@/domain/overview/model";
import type { Berth } from "@/domain/berths/types";
import type { OverviewBooking } from "@/domain/overview/types";

function booking(overrides: Partial<OverviewBooking> = {}): OverviewBooking {
  return {
    arrival_date: "2026-08-21",
    created_at: "2026-08-20T22:30:00Z",
    customer_name: "Anna Smith",
    departure_date: "2026-08-23",
    eta: "14:30:00",
    etd: "10:00:00",
    id: "booking-1",
    reference: "BK-TEST000001",
    status: "confirmed",
    vessel_name: "Sea Breeze",
    ...overrides,
  };
}

function berth(status: Berth["status"]): Berth {
  return {
    allow_smaller_vessels: true,
    code: `A-${status}`,
    created_at: "2026-08-01T00:00:00Z",
    id: `berth-${status}`,
    marina_id: "marina-a",
    max_beam_m: 3,
    max_draft_m: 2,
    max_length_m: 10,
    priority: 10,
    status,
    updated_at: "2026-08-01T00:00:00Z",
    zone: "North Pier",
  };
}

describe("Phase 7 overview model", () => {
  it("uses the marina timezone for the operational date", () => {
    const instant = new Date("2026-08-20T21:30:00Z");
    expect(marinaDateKey(instant, "Europe/Riga")).toBe("2026-08-21");
    expect(marinaDateKey(instant, "America/New_York")).toBe("2026-08-20");
  });

  it("excludes cancelled movements and non-operational berths", () => {
    const bookings = [
      booking(),
      booking({ id: "cancelled", reference: "BK-TEST000002", status: "cancelled" }),
    ];
    const metrics = deriveOverviewMetrics(
      bookings,
      [berth("available"), berth("blocked"), berth("out_of_service")],
      "2026-08-21",
    );
    expect(metrics).toEqual({
      activeStayCount: 1,
      arrivalsToday: 1,
      departuresToday: 0,
      occupancyPercent: 100,
      operationalBerthCount: 1,
    });
  });

  it("uses half-open stays and reports no percentage without capacity", () => {
    const metrics = deriveOverviewMetrics(
      [booking({ arrival_date: "2026-08-19", departure_date: "2026-08-21" })],
      [berth("blocked")],
      "2026-08-21",
    );
    expect(metrics.activeStayCount).toBe(0);
    expect(metrics.departuresToday).toBe(1);
    expect(metrics.occupancyPercent).toBeNull();
  });

  it("builds activity only from real same-day booking facts", () => {
    const activity = deriveTodaysActivity([booking()], "2026-08-21", "Europe/Riga");
    expect(activity.map(({ event }) => event)).toEqual(["Booking created", "Arrival"]);
    expect(activity[0]).toMatchObject({ time: "01:30", reference: "BK-TEST000001" });
  });
});
