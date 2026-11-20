import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { listBookings, BookingRepositoryError } from "@/domain/bookings/repository";
import { parseBookingSort } from "@/domain/bookings/list-sorting";

type Record = { id: string; marina_id: string; created_at: string; arrival_date: string; source: "online" | "manual"; booking_payment_id: string | null };
const rows: Record[] = [
  { id: "02", marina_id: "marina-a", created_at: "2026-11-17T10:00:00Z", arrival_date: "2026-11-01", source: "manual", booking_payment_id: null },
  { id: "01", marina_id: "marina-a", created_at: "2026-11-16T10:00:00Z", arrival_date: "2027-02-01", source: "online", booking_payment_id: "old-payment" },
  { id: "03", marina_id: "marina-a", created_at: "2026-11-18T10:00:00Z", arrival_date: "2026-11-30", source: "online", booking_payment_id: "online-payment" },
  { id: "04", marina_id: "marina-a", created_at: "2026-11-18T10:00:00Z", arrival_date: "2026-11-30", source: "online", booking_payment_id: null },
  { id: "99", marina_id: "other-marina", created_at: "2026-11-19T10:00:00Z", arrival_date: "2026-11-01", source: "online", booking_payment_id: null },
];

function database(cap = 1000, fail = false) {
  const orders: Array<[string, { ascending: boolean }]> = [];
  const filters: Array<[string, string]> = [];
  const query = {
    select: () => query,
    eq: (field: string, value: string) => { filters.push([field, value]); return query; },
    order: (field: string, options: { ascending: boolean }) => { orders.push([field, options]); return query; },
    then: (resolve: (value: unknown) => unknown) => {
      // Model the Data API boundary: SQL ordering precedes the API result cap.
      const data = rows.filter(row => filters.every(([field, value]) => row[field as keyof Record] === value))
        .sort((left, right) => {
          for (const [field, { ascending }] of orders) {
            const a = left[field as keyof Record] ?? "", b = right[field as keyof Record] ?? "";
            if (a !== b) return (a < b ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        }).slice(0, cap);
      return Promise.resolve({ data: fail ? null : data, error: fail ? { code: "42501" } : null }).then(resolve);
    },
  };
  return { client: { from: () => query } as unknown as SupabaseClient<Database>, orders, filters };
}

describe("booking list database ordering", () => {
  it("requests newest first before the server limit, independent of arrival date or payment method", async () => {
    const db = database(2);
    const result = await listBookings(db.client, "marina-a");
    expect(db.orders).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(result.map(row => row.id)).toEqual(["04", "03"]);
    expect(result.map(row => row.booking_payment_id)).toEqual([null, "online-payment"]);
    expect(db.filters).toEqual([["marina_id", "marina-a"]]);
  });

  it("uses descending IDs for identical creation timestamps across repeated reads", async () => {
    for (let read = 0; read < 2; read++) {
      expect((await listBookings(database().client, "marina-a", "newest")).map(row => row.id)).toEqual(["04", "03", "02", "01"]);
    }
  });

  it("requests earliest arrival first with deterministic ties before the server limit", async () => {
    const db = database(3);
    expect((await listBookings(db.client, "marina-a", "arrival")).map(row => row.id)).toEqual(["02", "04", "03"]);
    expect(db.orders).toEqual([["arrival_date", { ascending: true }], ["id", { ascending: false }]]);
    expect(db.filters).toEqual([["marina_id", "marina-a"]]);
  });

  it("keeps query failures explicit", async () => {
    await expect(listBookings(database(1000, true).client, "marina-a")).rejects.toBeInstanceOf(BookingRepositoryError);
  });

  it("allows only supported sort modes and defaults invalid or duplicate URL values to newest", () => {
    expect(parseBookingSort("arrival")).toBe("arrival");
    for (const value of [undefined, "", "newest", "created_at", "invalid", ["arrival", "newest"]]) expect(parseBookingSort(value)).toBe("newest");
  });
});
