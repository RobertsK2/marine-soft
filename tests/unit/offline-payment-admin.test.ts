import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), privileged: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getAuthorizationContext: mocks.auth }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: mocks.privileged }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/domain/pricing/repository", () => ({ loadPricingCatalog: vi.fn() }));
import { updateBookingPaymentStateAction } from "@/domain/bookings/action-service";

it.each([null, { role: "marina_staff", userId: "staff", marinaId: "marina" }])("blocks direct advanced editor calls without admin authorization", async context => {
  mocks.auth.mockResolvedValue(context);
  expect(await updateBookingPaymentStateAction("a1000000-0000-4000-8000-000000000001", { status: "idle" }, new FormData()))
    .toEqual({ status: "error", message: "Marina administrator access is required." });
  expect(mocks.privileged).not.toHaveBeenCalled();
});
