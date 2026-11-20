import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), update: vi.fn(), eq: vi.fn(), result: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/session", () => ({ getAuthorizationContext: mocks.context }));
vi.mock("@/domain/pricing/action-service", () => ({ updatePricingConfigurationAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  const query = { update: mocks.update, eq: mocks.eq, select: () => query, maybeSingle: mocks.result };
  mocks.update.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  return { from: () => query };
} }));
import { updatePaymentMethodsAction } from "@/app/dashboard/settings/pricing/actions";

const version = "2026-11-10T12:00:00Z";
const data = (enabled: boolean) => {
  const form = new FormData();
  form.set("onlinePayment", "on");
  if (enabled) form.set("payAtMarina", "on");
  form.set("marinaId", "forged-other-marina");
  return form;
};
describe("marina payment settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ role: "marina_admin", marinaId: "authorized-marina", marinaSlug: "marina-a" });
    mocks.result.mockResolvedValue({ data: { id: "authorized-marina" }, error: null });
  });
  it.each([null, { role: "marina_staff" }])("rejects non-admin access before any write (%j)", async context => {
    mocks.context.mockResolvedValue(context);
    expect(await updatePaymentMethodsAction(version, { status: "idle" }, data(true))).toMatchObject({ status: "error" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([true, false])("persists Pay at Marina=%s only for the authorized marina and expected version", async enabled => {
    expect(await updatePaymentMethodsAction(version, { status: "idle" }, data(enabled))).toMatchObject({ status: "success" });
    expect(mocks.update).toHaveBeenCalledWith({ accepts_online_payment: true, accepts_pay_at_marina: enabled });
    expect(mocks.eq.mock.calls).toEqual([["id", "authorized-marina"], ["updated_at", version]]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/marina/marina-a");
  });
  it("rejects disabling every method and stale saves", async () => {
    expect(await updatePaymentMethodsAction(version, { status: "idle" }, new FormData())).toMatchObject({ status: "error" });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.result.mockResolvedValue({ data: null, error: null });
    expect(await updatePaymentMethodsAction(version, { status: "idle" }, data(true))).toMatchObject({ status: "error" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
