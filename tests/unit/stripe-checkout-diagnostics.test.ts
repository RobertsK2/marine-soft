import { describe, expect, it } from "vitest";
import { classifyCheckoutFailure } from "@/domain/checkout/diagnostics";

function staged(stage: string, cause: unknown) {
  return Object.assign(new Error("guest data and secret"), { diagnosticStage: stage, cause });
}

describe("Checkout failure diagnostics", () => {
  it.each([
    ["stripe_initialization", "configuration"],
    ["payment_preparation", "database"],
    ["connected_account_configuration", "configuration"],
    ["site_url", "configuration"],
    ["payment_attachment", "database"],
    ["checkout_response", "unexpected"],
  ])("classifies %s without copying an error payload", (stage, category) => {
    expect(classifyCheckoutFailure(staged(stage, { message: "secret", code: "secret" }))).toEqual({
      operation: "stripe_checkout_create", stage, category,
    });
  });

  it("retains only an allowlisted Stripe category and code", () => {
    expect(classifyCheckoutFailure(staged("stripe_api", {
      type: "StripeInvalidRequestError", code: "resource_missing",
      message: "private account and guest data", requestId: "req_secret",
    }))).toEqual({
      operation: "stripe_checkout_create", stage: "stripe_api",
      category: "stripe_invalid_request", stripeCode: "resource_missing",
    });
  });

  it("drops unrecognized Stripe codes and types", () => {
    expect(classifyCheckoutFailure(staged("stripe_api", {
      type: "StripeUnknownError", code: "private_token", message: "private data",
    }))).toEqual({
      operation: "stripe_checkout_create", stage: "stripe_api", category: "stripe_unknown",
    });
    expect(classifyCheckoutFailure(staged("stripe_api", {
      type: "StripeAuthenticationError", code: "private_token",
    }))).toEqual({
      operation: "stripe_checkout_create", stage: "stripe_api", category: "stripe_authentication",
    });
  });

  it("rejects a forged stage", () => {
    expect(classifyCheckoutFailure(staged("secret=private", new Error("private")))).toEqual({
      operation: "stripe_checkout_create", stage: "checkout_response", category: "unexpected",
    });
  });
});
