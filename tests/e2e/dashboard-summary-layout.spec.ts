import { expect, test } from "@playwright/test";
import { completeAdminMfa } from "./helpers/admin-mfa";

const summaries = [
  { path: "bookings", label: "Booking status summary", count: 3 },
  { path: "berths", label: "Berth status summary", count: 4 },
  { path: "marina-map", label: "Berth status summary", count: 5 },
  { path: "payments", label: "Payment summary", count: 3 },
];

test("dashboard summary bars center equal-width metrics across screen sizes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SUPABASE_READY, "The desktop project covers all viewport widths with local fixtures.");
  await page.goto("/login");
  await page.getByLabel("Work Email").fill(process.env.E2E_MARINA_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_MARINA_PASSWORD!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await completeAdminMfa(page);

  for (const { path, label, count } of summaries) {
    await page.goto(`/dashboard/${path}`);
    const summary = page.getByLabel(label, { exact: true });
    await expect(page.getByRole("status", { name: "Loading Berthio" })).toBeHidden();
    await expect(summary).toBeVisible();
    await expect(summary.locator(":scope > *")).toHaveCount(count);
    for (const width of [1440, 820, 320]) {
      await test.step(`${path} at ${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        const layout = await summary.evaluate((bar) => {
          const bounds = bar.getBoundingClientRect();
          const parent = bar.parentElement!;
          const parentStyle = getComputedStyle(parent);
          const available = parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
          const metrics = Array.from(bar.children, (metric) => {
            const box = metric.getBoundingClientRect();
            const text = Array.from(metric.querySelectorAll("h2, p, dt, dd, strong, small, span"), (element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return range.getBoundingClientRect();
            }).filter((rect) => rect.width > 0);
            return {
              width: box.width,
              row: box.top,
              center: (box.left + box.right) / 2,
              centered: text.length > 0 && text.every((rect) =>
                Math.abs(rect.left + rect.right - box.left - box.right) < 3 &&
                rect.left >= box.left && rect.right <= box.right),
            };
          });
          return {
            metrics,
            center: (bounds.left + bounds.right) / 2,
            unusedWidth: Math.abs(bounds.width - available),
            summaryOverflow: bar.scrollWidth - bar.clientWidth,
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        expect(layout.unusedWidth).toBeLessThanOrEqual(1);
        expect(layout.summaryOverflow).toBeLessThanOrEqual(0);
        expect(layout.pageOverflow).toBeLessThanOrEqual(0);
        expect(layout.metrics.every((metric) => metric.centered)).toBe(true);
        expect(Math.max(...layout.metrics.map((metric) => metric.width)) -
          Math.min(...layout.metrics.map((metric) => metric.width))).toBeLessThan(1);

        const columns = width === 320 ? 2 : width === 820 && count === 5 ? 3 : count;
        expect(new Set(layout.metrics.map((metric) => metric.row)).size).toBe(Math.ceil(count / columns));
        for (let index = 0; index < count; index += columns) {
          const row = layout.metrics.slice(index, index + columns);
          expect(Math.abs((row[0].center + row.at(-1)!.center) / 2 - layout.center)).toBeLessThan(1);
        }
      });
    }
  }
});
