import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPageSkeleton, type AdminLoadingPage } from "@/components/loading/admin-page-skeleton";
import { InitialLoading } from "@/components/loading/initial-loading";

const pages: AdminLoadingPage[] = ["overview", "bookings", "booking-detail", "new-booking", "map", "berths", "new-berth", "berth-detail", "edit-berth", "payments", "settings", "general", "pricing", "cancellation-policy", "integrations", "publishing", "audit", "import"];

describe("admin loading accessibility", () => {
  it.each(pages)("%s announces loading without exposing pretend data or interactive controls", (page) => {
    const html = renderToStaticMarkup(createElement(AdminPageSkeleton, { page }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain(`data-loading-page="${page}"`);
    expect(html).not.toMatch(/<(input|button|a|table|nav)[\s>]/);
    expect(html.replace(/<[^>]*>/g, "")).toBe("Loading page content");
  });

  it("reserves the global fallback for a neutral branded status", () => {
    const html = renderToStaticMarkup(createElement(InitialLoading));
    expect(html).toContain('aria-label="Loading Berthio"');
    expect(html.replace(/<[^>]*>/g, "")).toBe("Berthio");
    expect(html).not.toContain('aria-busy="true"');
  });
});
