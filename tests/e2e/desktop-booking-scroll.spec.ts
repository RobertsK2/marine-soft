import { expect, test } from "@playwright/test";

type ScrollCall = { behavior?: ScrollBehavior; top?: number };

async function recordScrollCalls(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const calls: ScrollToOptions[] = [];
    const original = window.scrollTo.bind(window);
    Object.defineProperty(window, "__bookingScrollCalls", { configurable: true, value: calls });
    window.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
      if (typeof options === "object") calls.push(options);
      return typeof options === "number" ? original(options, y ?? 0) : original(options);
    }) as typeof window.scrollTo;
  });
}

async function scrollCalls(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as typeof window & { __bookingScrollCalls: ScrollCall[] }).__bookingScrollCalls);
}

async function fillSearch(page: import("@playwright/test").Page, length = "9.5") {
  await page.getByLabel("Arrival date", { exact: true }).fill("2026-12-14");
  await page.getByLabel("Departure date", { exact: true }).fill("2026-12-17");
  await page.getByLabel("Vessel name").fill("Desktop Scroll Test");
  await page.getByLabel("Length Overall (LOA)").fill(length);
  await page.getByLabel("Beam (Width)").fill("3.1");
  await page.getByLabel("Draft (Depth)").fill("1.7");
  await page.getByLabel("ETA", { exact: false }).fill("14:00");
  await page.getByLabel("ETD", { exact: false }).fill("10:00");
}

test("desktop scrolls to each newly rendered successful result and respects reduced motion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SUPABASE_READY, "Desktop with local Supabase fixtures required.");
  await page.goto("/marina/marina-a");
  await page.locator("main > header").evaluate((header) => {
    header.style.position = "sticky";
    header.style.top = "0";
    header.style.zIndex = "1";
  });
  await fillSearch(page);
  await recordScrollCalls(page);
  const check = page.getByRole("button", { name: "Check Availability", exact: true });
  await check.scrollIntoViewIfNeeded();
  const viewportBeforeSearch = await page.evaluate(() => window.scrollY);

  let deliver!: () => void;
  const delivery = new Promise<void>((resolve) => { deliver = resolve; });
  await page.route("**/marina/marina-a?**", async (route) => { await delivery; await route.continue(); });
  try {
    await check.click();
    await expect(page.getByRole("button", { name: "Checking availability…" })).toBeDisabled();
    expect(await page.evaluate(() => window.scrollY)).toBe(viewportBeforeSearch);
    expect(await scrollCalls(page)).toEqual([]);
  } finally {
    deliver();
  }

  const result = page.locator('[data-availability="available"]');
  await expect(result).toBeVisible();
  await expect.poll(async () => (await scrollCalls(page)).length).toBe(1);
  expect((await scrollCalls(page))[0].behavior).toBe("smooth");
  await expect.poll(async () => result.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(110);
  expect(await result.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(80);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Vessel name").fill("Desktop Scroll Test Edited");
  await check.click();
  await expect(result).toBeVisible();
  await expect.poll(async () => (await scrollCalls(page)).length).toBe(2);
  expect((await scrollCalls(page))[1].behavior).toBe("auto");
});

test("desktop does not scroll for an unavailable result", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SUPABASE_READY, "Desktop with local Supabase fixtures required.");
  await page.goto("/marina/marina-a");
  await fillSearch(page, "99");
  await recordScrollCalls(page);
  const check = page.getByRole("button", { name: "Check Availability", exact: true });
  await check.scrollIntoViewIfNeeded();
  const viewportBeforeSearch = await page.evaluate(() => window.scrollY);
  await check.click();
  await expect(page.locator('[data-availability="no_suitable_berth"]')).toBeVisible();
  expect(await scrollCalls(page)).toEqual([]);
  expect(await page.evaluate(() => window.scrollY)).toBe(viewportBeforeSearch);
});

test("desktop does not scroll for validation errors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SUPABASE_READY, "Desktop with local Supabase fixtures required.");
  await page.goto("/marina/marina-a");
  await fillSearch(page);
  await page.getByLabel("ETA", { exact: false }).fill("");
  await recordScrollCalls(page);
  const check = page.getByRole("button", { name: "Check Availability", exact: true });
  await check.scrollIntoViewIfNeeded();
  const viewportBeforeSearch = await page.evaluate(() => window.scrollY);
  await check.click();
  await expect(page.getByText("Enter a valid ETA in marina local time.")).toBeVisible();
  expect(await scrollCalls(page)).toEqual([]);
  expect(await page.evaluate(() => window.scrollY)).toBe(viewportBeforeSearch);
});
