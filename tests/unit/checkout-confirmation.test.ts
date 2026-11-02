import { describe, expect, it } from "vitest";
import { checkoutPaymentState, confirmationMoney, confirmationPriceLines, validCheckoutSession } from "@/domain/checkout/confirmation";

describe("checkout confirmation", () => {
  it("requires a paid payment and an active server booking", () => {
    expect(checkoutPaymentState("pending")).toBe("processing");
    expect(checkoutPaymentState("pending", "confirmed")).toBe("processing");
    expect(checkoutPaymentState("paid")).toBe("processing");
    expect(checkoutPaymentState("paid", "confirmed")).toBe("paid");
    expect(checkoutPaymentState("paid", "checked_in")).toBe("paid");
    expect(checkoutPaymentState("paid", "cancelled")).toBe("unavailable");
    expect(checkoutPaymentState("failed", "confirmed")).toBe("failed");
  });

  it("rejects missing, duplicate, malformed, and oversized session IDs", () => {
    for (const value of [undefined, ["cs_test_valid", "cs_test_other"], "", "cs_", "payment_success", "cs_test_<script>", `cs_test_${"a".repeat(201)}`]) expect(validCheckoutSession(value)).toBe(false);
    expect(validCheckoutSession("cs_test_session123")).toBe(true);
  });

  it("reconciles exclusive and inclusive taxes without counting inclusive tax twice", () => {
    const snapshot = { version: 1, currency: "EUR", totalMinor: 17908, accommodationMinor: 14000, mandatoryFeesMinor: 800, taxMinor: 3108, taxBehavior: "exclusive", taxRateBps: 2100 };
    expect(confirmationPriceLines(snapshot, 17908, "EUR")).toHaveLength(3);
    expect(confirmationPriceLines({ ...snapshot, accommodationMinor: 17108, taxBehavior: "inclusive" }, 17908, "EUR")[2].label).toContain("included");
    for (const invalid of [null, {}, { ...snapshot, totalMinor: 1 }, { ...snapshot, taxMinor: -1 }, { ...snapshot, currency: "USD" }, { ...snapshot, accommodationMinor: 0 }]) expect(confirmationPriceLines(invalid, 17908, "EUR")).toEqual([]);
  });

  it("formats currencies using their actual minor units", () => {
    expect(confirmationMoney(17908, "EUR")).toBe("€179.08");
    expect(confirmationMoney(5000, "JPY")).toContain("5,000");
    expect(confirmationMoney(1234, "KWD")).toContain("1.234");
  });
});
