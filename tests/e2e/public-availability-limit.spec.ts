import { expect, test } from "@playwright/test";

test("public availability rejects repeated valid searches before further snapshot work", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SUPABASE_READY, "Local database required.");
  const dateAfter = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    arrivalDate: dateAfter(30), departureDate: dateAfter(32), eta: "14:00", etd: "10:00",
    vesselLengthM: "9.5", vesselBeamM: "3.1", vesselDraftM: "1.7",
  });
  const url = `/marina/marina-a?${query}`;
  const first = await page.request.get(url);
  expect(first.status()).toBe(200);
  expect(await first.text()).not.toContain("Too many availability checks.");
  const cookie = first.headers()["set-cookie"]?.match(/berthio_anonymous_booking=[A-Za-z0-9_-]{43}/)?.[0];
  expect(cookie).toBeTruthy();
  // Local production tests use HTTP. Replay the server-issued Secure cookie
  // explicitly, as an HTTPS browser would, without weakening production cookies.
  const headers = { Cookie: cookie! };
  for (let attempt = 2; attempt <= 20; attempt++) {
    const response = await page.request.get(url, { headers });
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain("Too many availability checks.");
  }
  // A minute boundary can split the 20 allowed requests across two buckets.
  let limited = false;
  for (let attempt = 21; attempt <= 42 && !limited; attempt++) {
    const response = await page.request.get(url, { headers });
    expect(response.status()).toBe(200);
    limited = (await response.text()).includes("Too many availability checks. Please try again shortly.");
  }
  expect(limited).toBe(true);
});
