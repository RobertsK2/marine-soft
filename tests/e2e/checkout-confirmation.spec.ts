import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

// Run with playwright.confirmation.config.ts; never point this at a real DB.
test.skip(!process.env.BERTHIO_CONFIRMATION_FIXTURES, "Requires the isolated confirmation HTTP fixture config.");
const path = "/marina/test-harbour/checkout/return";

test.beforeEach(async ({ page }) => {
  await page.route("https://fixture.berthio.test/harbour.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="280"><rect width="1000" height="280" fill="#698ca2"/><path d="M0 230L1000 150M100 0L220 280M400 0L520 280M700 0L820 280" stroke="#c6ced2" stroke-width="20"/></svg>' }));
});

test("paid booking: responsive layout, copy, real PDF, and refresh", async ({ page, context }, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${path}?session_id=cs_test_paid`);
  await expect(page.getByRole("heading", { name: "Your berth is booked!" })).toBeVisible();
  await expect(page.getByText("Jūras vējš IV")).toBeVisible();
  await expect(page.getByText("Keep your confirmation")).toBeVisible();
  await expect(page.getByText("Confirmation sent", { exact: true })).toHaveCount(0);
  await expect(page.getByText("WHAT HAPPENS NEXT")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Arrival information" }).locator(":scope > div")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === "mobile") {
    const cover = await page.getByRole("img", { name: "Test Harbour Ādaži harbour" }).boundingBox();
    const heading = await page.getByRole("heading", { name: "Your berth is booked!" }).boundingBox();
    expect(cover!.y + cover!.height).toBeLessThan(heading!.y);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.getByRole("button", { name: "Copy booking reference" }).click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("BK-TEST-8492");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download.*Confirmation|Download confirmation/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("booking-BK-TEST-8492.pdf");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const pdf = await PDFDocument.load(Buffer.concat(chunks));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toContain("BK-TEST-8492");
  const response = await page.request.get(`${path}/confirmation?session_id=cs_test_paid`);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["content-type"]).toBe("application/pdf");
  await download.saveAs(info.outputPath("confirmation.pdf"));
  await page.screenshot({ path: info.outputPath("confirmation.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your berth is booked!" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to marina" })).toHaveAttribute("href", "/marina/test-harbour");
  await expect(page.locator("aside a").last()).toHaveAttribute("href", "tel:+37120000000");
});

test("a selected arrival window survives checkout without invented exact times", async ({ page, request }) => {
  await page.goto(`${path}?session_id=cs_test_paid_morning`);
  await expect(page.getByRole("heading", { name: "Your berth is booked!" })).toBeVisible();
  await expect(page.getByText("Morning (06:00–12:00)")).toBeVisible();
  await expect(page.getByText("Not specified", { exact: true })).toBeVisible();
  const response = await request.get(`${path}/confirmation?session_id=cs_test_paid_morning`);
  expect(response.status()).toBe(200);
  const pdf = await PDFDocument.load(await response.body());
  expect(pdf.getPageCount()).toBe(1);
});

test("unknown exact times and no arrival preference remain explicitly unspecified", async ({ page, request }) => {
  await page.goto(`${path}?session_id=cs_test_paid_unspecified`);
  await expect(page.getByRole("heading", { name: "Your berth is booked!" })).toBeVisible();
  await expect(page.getByText("Not specified", { exact: true })).toHaveCount(2);
  expect((await request.get(`${path}/confirmation?session_id=cs_test_paid_unspecified`)).status()).toBe(200);
});

test("pending, failed, cancelled and inaccessible bookings never show paid confirmation", async ({ page, request }) => {
  for (const [session, heading] of [["pending", "Confirming your booking..."], ["failed", "Payment was not completed"], ["cancelled", "This booking is cancelled"]]) {
    await page.goto(`${path}?session_id=cs_test_${session}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText("Total Paid", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Jūras vējš IV")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Download/ })).toHaveCount(0);
    expect((await request.get(`${path}/confirmation?session_id=cs_test_${session}`)).status()).toBe(409);
  }
  for (const suffix of ["", "?session_id=bad", "?session_id=cs_test_unknown", "?session_id=cs_test_paid&session_id=cs_test_pending"]) {
    // The root loading boundary streams the response before notFound resolves.
    // Verify the actual inaccessible UI and absence of booking data.
    await page.goto(path + suffix);
    await expect(page.getByRole("heading", { name: "Booking unavailable" })).toBeVisible();
    await expect(page.getByText("Jūras vējš IV")).toHaveCount(0);
    await expect(page.getByText("BK-TEST-8492", { exact: true })).toHaveCount(0);
    expect((await request.get(path + "/confirmation" + suffix)).status()).toBe(404);
  }
  await page.goto("/marina/other-tenant/checkout/return?session_id=cs_test_paid");
  await expect(page.getByRole("heading", { name: "Booking unavailable" })).toBeVisible();
  await expect(page.getByText("Jūras vējš IV")).toHaveCount(0);
  expect((await request.get("/marina/other-tenant/checkout/return/confirmation?session_id=cs_test_paid")).status()).toBe(404);
});
