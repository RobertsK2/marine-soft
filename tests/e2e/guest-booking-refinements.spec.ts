import { expect, test } from "@playwright/test";

test.skip(!process.env.BERTHIO_CONFIRMATION_FIXTURES, "Requires isolated confirmation fixtures.");
const bookingUrl = "/marina/marina-a";
const query = new URLSearchParams({ arrivalDate: "2027-05-24", departureDate: "2027-05-28", eta: "14:00", etd: "10:00", vesselLengthM: "11.5", vesselBeamM: "3.8", vesselDraftM: "1.6", vesselName: "UI test vessel" });
const blue = "rgb(7, 80, 237)";
test.beforeEach(async ({ page }) => {
  await page.route("https://fixture.berthio.test/harbour.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="280"><rect width="1000" height="280" fill="#698ca2"/></svg>' }));
});

test("guest controls: blue actions, empty times and aligned mobile dimensions", async ({ page }, info) => {
  await page.goto(bookingUrl);
  const check = page.getByRole("button", { name: "Check Availability", exact: true });
  await expect(check).toHaveCSS("background-color", blue);
  await expect(page.locator(".field-error, [aria-invalid=true]")).toHaveCount(0);
  for (const label of ["Length", "Beam", "Draft"]) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  {
    for (const name of ["eta", "etd"]) {
      const field = page.locator(`[name="${name}"]`);
      const hint = page.locator(`#public-${name}-hint`);
      await expect(hint).toBeVisible();
      await expect(field).toHaveAttribute("aria-describedby", `public-${name}-hint`);
      await field.fill("14:00");
      await expect(hint).toHaveCount(0);
      await page.locator("form").first().evaluate((form: HTMLFormElement) => form.reset());
      await page.locator("header").first().click();
      await expect(hint).toBeVisible();
      await field.fill("");
      await expect(field).toBeFocused();
      await expect(hint).toBeHidden(); // Leave room for editing the time segments.
      await page.locator("header").first().click();
      await expect(hint).toBeVisible();
    }
  }
  await page.reload();
  await expect(check).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: info.outputPath("booking-controls.png"), fullPage: true });
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await Promise.all(["vesselLengthM", "vesselBeamM", "vesselDraftM"].map(name => page.locator(`[name="${name}"]`).boundingBox()));
    expect(boxes.every(box => box !== null)).toBe(true);
    expect(Math.max(...boxes.map(box => box!.y)) - Math.min(...boxes.map(box => box!.y))).toBeLessThan(1);
    expect(new Set(boxes.map(box => box!.height)).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(check).toHaveCSS("background-color", blue);
    await page.screenshot({ path: info.outputPath(`initial-${width}.png`), fullPage: true });
  }
  for (const name of ["arrivalDate", "departureDate", "vesselLengthM", "vesselBeamM", "vesselDraftM", "eta", "etd"]) {
    await page.locator(`[name="${name}"]`).fill(query.get(name)!);
  }
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/marina/marina-a?**", async route => { await held; await route.continue(); });
  try {
    await check.click();
    const loading = page.getByRole("button", { name: "Checking availability…", exact: true });
    await expect(loading).toBeDisabled();
    await expect(loading).toHaveCSS("background-color", "rgb(111, 143, 201)");
  } finally { release(); }
  await expect(page.getByRole("button", { name: "Continue to Payment", exact: true })).toBeVisible();
});

test("floating calendars keep ISO values, range state, keyboard and dismissal behavior", async ({ page }, info) => {
  await page.goto(`${bookingUrl}?${query}`);
  if (info.project.name === "mobile") await page.getByRole("button", { name: "Back / Edit Search" }).click();
  const arrival = page.getByRole("button", { name: "Choose arrival date", exact: true });
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await page.locator('[name="arrivalDate"]').click();
  const calendar = page.getByRole("dialog", { name: /^Arrival date calendar/ });
  await expect(calendar).toBeVisible();
  await page.screenshot({ path: info.outputPath("calendar-open.png"), fullPage: true });
  await expect(calendar.locator('[data-range="true"]')).toHaveCount(3);
  const selected = calendar.locator('[data-date="2027-05-24"]');
  await expect(selected).toBeFocused();
  await selected.press("ArrowRight");
  await expect(calendar.locator('[data-date="2027-05-25"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(calendar).toHaveCount(0);
  await expect(page.locator('[name="arrivalDate"]')).toHaveValue("2027-05-25");
  await expect(page.locator('[data-availability="available"]')).toBeHidden();
  await expect(page.getByText("Details changed. Please check availability again.")).toBeVisible();
  await arrival.click();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(arrival).toBeFocused();
  await arrival.click();
  await page.locator("header").first().click();
  await expect(calendar).toHaveCount(0);
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Choose departure date" }).click();
    const popup = page.getByRole("dialog", { name: /^Departure date calendar/ });
    const bounds = await popup.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`calendar-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
  }
  await page.goto(bookingUrl);
  await arrival.click();
  const min = await page.locator('[name="arrivalDate"]').getAttribute("min");
  const month = min!.slice(0, 7);
  await expect(calendar.getByRole("button", { name: "Previous month" })).toBeDisabled();
  const older = calendar.locator("button[data-date]").filter({ hasNot: page.locator(":disabled") });
  expect(await older.count()).toBeGreaterThan(0);
  const dates = await calendar.locator("button[data-date]:disabled").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-date")));
  expect(dates.every(date => date! < min!)).toBe(true);
  await expect(calendar.locator(`[data-date^="${month}"]`).first()).toBeVisible();
  await calendar.getByRole("button", { name: "Next month" }).click();
  await expect(calendar.getByRole("button", { name: "Previous month" })).toBeEnabled();
  await calendar.getByRole("button", { name: "Previous month" }).click();
  await expect(calendar.getByRole("button", { name: "Previous month" })).toBeDisabled();
});

test("payment and confirmation use actual phone; missing contact data is omitted", async ({ page }, info) => {
  await page.goto(`${bookingUrl}?${query}`);
  const pay = page.getByRole("button", { name: "Continue to Payment", exact: true });
  await expect(pay).toBeVisible();
  await expect(pay).toHaveCSS("background-color", blue);
  const result = page.locator('[data-availability="available"]');
  await expect(result.getByRole("link", { name: "+37120000000", exact: true })).toHaveAttribute("href", "tel:+37120000000");
  await page.goto(`${bookingUrl}/checkout/return?session_id=cs_test_paid`);
  await expect(page.locator("aside a[href^='tel:']").first()).toHaveAttribute("href", "tel:+37120000000");
  await expect(page.getByText(/VHF/)).toHaveCount(0);
  await page.goto(`/marina/no-contact?${query}`);
  await expect(page.locator("a[href^='tel:'], a[href^='mailto:']")).toHaveCount(0);
  await page.goto("/marina/no-contact/checkout/return?session_id=cs_test_paid");
  await expect(page.locator("aside")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("missing-contact.png"), fullPage: true });
});

test("login uses the current official SVG without changing authentication", async ({ page }, info) => {
  await page.goto("/login");
  const logos = page.locator('img[src="/brand/berthio_horizontal.svg"]');
  expect(await logos.count()).toBeGreaterThan(0);
  expect(await page.locator('img[src*="berthio-mark.svg"]').count()).toBe(0);
  for (const image of await logos.all()) {
    expect(await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByRole("heading", { name: "Sign in to Berthio" })).toBeVisible();
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  await page.screenshot({ path: info.outputPath("login.png"), fullPage: true });
});


test("prefilled links stay clean; submitted errors preserve constraints without hidden time errors", async ({ page }) => {
  await page.goto(`${bookingUrl}?arrivalDate=&vesselLengthM=`);
  await expect(page.locator(".field-error, [aria-invalid=true]")).toHaveCount(0);
  for (const name of ["eta", "etd"]) await expect(page.locator(`#public-${name}-hint`)).toBeVisible();
  await page.getByRole("button", { name: "Check Availability", exact: true }).click();
  await expect(page.locator("#public-vesselLengthM-error")).toHaveText("Enter a measurement.");
  await expect(page.locator("#public-eta-error, #public-etd-error")).toHaveCount(0);
  await expect(page.getByText("Arrival or departure time is invalid", { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-availability]')).toHaveCount(0);
  const invalid = new URLSearchParams(query);
  invalid.set("eta", "25:99");
  invalid.set("vesselLengthM", "0");
  invalid.set("departureDate", invalid.get("arrivalDate")!);
  invalid.set("searchAttempt", "regression-invalid");
  await page.goto(`${bookingUrl}?${invalid}`);
  await expect(page.locator("#public-vesselLengthM-error")).toHaveText("Use 0.01–9999.99 m.");
  await expect(page.locator("#public-eta-error")).toHaveText("Enter a valid time (HH:MM).");
  await expect(page.locator("#public-departureDate-error")).toHaveText("Departure must be after arrival.");
  await expect(page.locator('[data-availability]')).toHaveCount(0);
});
