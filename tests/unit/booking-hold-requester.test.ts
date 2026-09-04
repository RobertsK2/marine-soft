import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.fn();
const cookieSet = vi.fn();
const headerGet = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet, set: cookieSet }),
  headers: async () => ({ get: headerGet }),
}));
vi.mock("@/lib/env", () => ({
  getGuestAccessSigningSecret: () => "unit-test-requester-secret-with-32-bytes",
}));

import { getBookingHoldRequester } from "@/domain/booking-holds/requester";

describe("anonymous booking hold requester", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
    cookieGet.mockReset();
    cookieSet.mockReset();
    headerGet.mockReset();
    headerGet.mockImplementation((name: string) => name === "x-vercel-forwarded-for" ? "203.0.113.10" : null);
  });

  it("returns only pseudonymous hashes when proxy-issued session state is absent", async () => {
    cookieGet.mockReturnValue(undefined);
    const requester = await getBookingHoldRequester();

    expect(requester.sessionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(requester.networkHash).toMatch(/^[0-9a-f]{64}$/);
    expect(requester.networkHash).not.toContain("203.0.113.10");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("reuses a valid session token while keeping different networks in different buckets", async () => {
    const token = "a".repeat(43);
    cookieGet.mockReturnValue({ value: token });
    const first = await getBookingHoldRequester();
    headerGet.mockImplementation((name: string) => name === "x-vercel-forwarded-for" ? "203.0.113.11" : null);
    const second = await getBookingHoldRequester();

    expect(second.sessionHash).toBe(first.sessionHash);
    expect(second.networkHash).not.toBe(first.networkHash);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("supports an explicitly trusted self-hosted proxy header", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BOOKING_HOLD_TRUSTED_IP_HEADER", "x-real-ip");
    cookieGet.mockReturnValue({ value: "a".repeat(43) });
    headerGet.mockImplementation((name: string) => name === "x-real-ip" ? "198.51.100.20" : null);
    const first = await getBookingHoldRequester();
    headerGet.mockImplementation((name: string) => name === "x-real-ip" ? "198.51.100.21" : null);
    const second = await getBookingHoldRequester();
    expect(second.networkHash).not.toBe(first.networkHash);
  });
});
