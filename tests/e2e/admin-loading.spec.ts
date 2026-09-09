import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test.setTimeout(90000);
test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");

async function signIn(page: Page, email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (result.error) throw new Error("Local test sign-in failed.");
  await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard`);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
}

test("sidebar stays mounted and usable across admin navigation", async ({ page }, testInfo) => {
  await signIn(page, "admin-a@berthio.test");
  const sidebar = page.locator(".app-bar");
  await sidebar.evaluate((element) => element.setAttribute("data-persistence-check", "mounted"));
  const nav = page.getByRole("navigation", { name: "Marina administration" });
  for (const [link, heading] of [["Bookings", "Bookings"], ["Berths", "Berths"], ["Payments", "Payments"], ["Settings", "Settings"]]) {
    await nav.getByRole("link", { name: link, exact: true }).click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-persistence-check", "mounted");
    await expect(nav.getByRole("link", { name: link, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("main")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Integrations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-persistence-check", "mounted");
  const logo = sidebar.getByRole("link", { name: "Go to Overview", exact: true });
  await expect(logo).toHaveAttribute("href", "/dashboard");
  const dimensions = await logo.boundingBox();
  const tenant = await sidebar.locator(".overview-tenant").innerText();
  await logo.click();
  await expect(page).toHaveURL("http://localhost:3000/dashboard");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-persistence-check", "mounted");
  await expect(sidebar.locator(".overview-tenant")).toHaveText(tenant, { useInnerText: true });
  const afterNavigation = await logo.boundingBox();
  expect(afterNavigation?.width).toBe(dimensions?.width);
  expect(afterNavigation?.height).toBe(dimensions?.height);
  await page.screenshot({ path: testInfo.outputPath("persistent-admin-shell.png"), fullPage: true });
});

test("staff navigation keeps the existing role restrictions", async ({ page }) => {
  await signIn(page, "staff-a@berthio.test");
  const nav = page.getByRole("navigation", { name: "Marina administration" });
  await expect(nav.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  await nav.getByRole("link", { name: "Berths", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Berths", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
});

test("server emits a content skeleton that respects reduced motion", async ({ page }, testInfo) => {
  await signIn(page, "admin-a@berthio.test");
  await page.goto("/dashboard/bookings");
  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.request.get("/dashboard/bookings");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  // Freeze the server-emitted fallback for visual inspection, independently of
  // machine speed and development mode's disabled automatic prefetch.
  await page.evaluate((markup) => {
    const documentSnapshot = new DOMParser().parseFromString(markup, "text/html");
    const fallback = documentSnapshot.querySelector('[data-loading-page="bookings"]');
    const content = document.querySelector(".admin-content");
    if (!fallback || !content) throw new Error("The route did not emit its loading boundary.");
    content.replaceChildren(document.importNode(fallback, true));
  }, html);
  const loading = page.locator('[data-loading-page="bookings"]');
  await expect(loading).toBeVisible();
  await expect(page.locator(".app-bar")).toBeVisible();
  await expect(loading).toHaveAttribute("aria-busy", "true");
  expect(await loading.locator('[aria-hidden="true"] span').first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("bookings-loading.png"), fullPage: true });
});
