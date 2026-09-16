import { expect, test } from "@playwright/test";

test("login layout, labels, keyboard controls and validation", async ({ page }, testInfo) => {
  await page.goto("/login?next=%2Fdashboard%2Fbookings");
  await expect(page.getByRole("heading", { name: "Sign in to Berthio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Berthio home" }).locator("img")).toHaveAttribute("src", "/brand/berthio-mark.svg");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText(/ACCESS TERMINAL|SYSTEM BUILD|ENCRYPTED SESSION|Restricted/)).toHaveCount(0);
  await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard/bookings");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
  const email = page.getByLabel("Work Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await email.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await password.fill("visibility-check");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("visibility-check");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", "email-error");
  await expect(page.locator("#email-error")).toHaveText("Enter a valid email address.");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#password-error")).toHaveText("Use at least 8 characters.");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("login retains inline callback errors and password-update confirmation", async ({ page }) => {
  for (const [query, message] of [
    ["error=no-membership", "This account does not have an active marina membership."],
    ["error=invalid-callback", "This authentication link is invalid or expired."],
    ["message=password-updated", "Your password has been updated. You can log in now."],
  ]) {
    await page.goto(`/login?${query}`);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
  }
});

test("legal links reach Berthio routes without presenting unapproved text as an agreement", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "Terms of service unavailable" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("DockPay");
  await page.goto("/login");
  await page.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy policy unavailable" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("DockPay");
});

test("desktop split and unchanged centered mobile/tablet proportions", async ({ page }, testInfo) => {
  await page.goto("/login");
  const panel = page.getByRole("complementary", { name: "About Berthio" });
  const card = page.getByRole("region", { name: "Sign in to Berthio" });
  for (const [width, height] of [[390, 844], [375, 812], [820, 1180], [1099, 900], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    const bounds = (await card.boundingBox())!;
    if (width < 1100) {
      await expect(panel).toBeHidden();
      expect(bounds.width).toBe(width <= 380 ? width : Math.min(width - 32, 500));
      expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThan(1);
      const padding = await card.evaluate((element) => getComputedStyle(element).padding);
      expect(padding).toBe(width <= 560 ? "28px 20px" : "32px");
    } else {
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading")).toHaveText("Marina operations,in one place.");
      const brandBounds = (await panel.boundingBox())!;
      expect(brandBounds.x + brandBounds.width).toBeCloseTo(bounds.x, 0);
      expect(brandBounds.y).toBe(bounds.y);
      expect(bounds.width / (brandBounds.width + bounds.width)).toBeCloseTo(.52, 2);
      const shellWidth = brandBounds.width + bounds.width + 2;
      expect(shellWidth).toBeCloseTo(Math.min(1120, Math.max(960, width * .75)), 0);
      expect(bounds.height).toBeGreaterThanOrEqual(558);
      expect(bounds.y + bounds.height / 2).toBeLessThan(height / 2);
      expect(bounds.y + bounds.height / 2).toBeGreaterThan(height / 2 - 60);
      const input = (await page.getByLabel("Work Email", { exact: true }).boundingBox())!;
      expect(input.width).toBeGreaterThanOrEqual(420);
      expect(input.width).toBeLessThanOrEqual(480);
      expect(input.height).toBeGreaterThanOrEqual(54);
      expect((await page.getByRole("button", { name: "Sign In", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(56);
    }
    await expect(page.getByLabel("Work Email", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true });
  }
});

test("sign-in remains disabled while submitting and shows a safe auth error", async ({ page }) => {
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  await page.goto("/login");
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/login", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  await page.getByLabel("Work Email", { exact: true }).fill("login-layout-missing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("invalid-password");
  try {
    await page.getByRole("button", { name: "Sign In", exact: true }).click({ noWaitAfter: true });
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    expect(await page.locator(".spin").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  } finally { release(); }
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Email or password is incorrect.");
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
});
