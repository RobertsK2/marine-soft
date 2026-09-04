import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("public foundation and login routes remain available", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Marina operations start here." }),
  ).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in to Berthio" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test.describe("public marina page", () => {
  test.skip(
    !process.env.E2E_SUPABASE_READY,
    "Requires the seeded local Supabase stack.",
  );

  test("published marina data is available without admin controls", async ({ page }) => {
    await page.goto("/marina/marina-a");
    await expect(page.getByRole("heading", { name: "Marina A", level: 1 })).toBeVisible();
    await expect(
      page.getByLabel("Marina local time context").getByText("Europe/Riga", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request a berth" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Marina A marina map preview" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /dashboard|admin/i })).toHaveCount(0);
  });

  test("unpublished and unknown marina slugs return not found", async ({ page }) => {
    await page.goto("/marina/marina-b");
    await expect(page.locator("body")).toContainText("404");

    await page.goto("/marina/not-a-marina");
    await expect(page.locator("body")).toContainText("404");
  });

  test("booking search validates and preserves a clean timezone-aware request", async ({ page }) => {
    const today = new Date();
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 20));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 23));
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);

    await page.goto("/marina/marina-a#booking-entry");
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("14:30");
    await page.getByLabel("ETD").fill("10:00");
    await page.getByLabel("Vessel name").fill("Test Aurora");
    await page.getByLabel("Length (m)").fill("12.5");
    await page.getByLabel("Beam (m)").fill("3.8");
    await page.getByLabel("Draft (m)").fill("2.1");
    await page.getByRole("button", { name: "Check availability" }).click();

    await expect(page).toHaveURL(/arrivalDate=.*&departureDate=.*&eta=14%3A30/);
    await expect(page.getByRole("status")).toContainText("Available for these dates");
    await expect(page.getByRole("status")).toContainText("3 nights");
    await expect(page.getByRole("status")).toContainText("No booking has been created");
    const quote = page.locator("[data-price-total-minor='15344']");
    await expect(quote).toContainText("Price breakdown");
    await expect(quote).toContainText("Baltic high season");
    await expect(quote).toContainText("Harbour administration");
    await expect(quote).toContainText("Tax / VAT 21%");
    await expect(quote).toContainText("€153.44");
    await expect(quote).toContainText(/no booking, payment, or capacity hold has been created/i);
    await expect(page.getByLabel("Vessel name")).toHaveValue("Test Aurora");
    await expect(
      page.locator("#booking-entry").getByText("Europe/Riga", { exact: true }),
    ).toBeVisible();
  });

  test("public availability returns a safe no-fit result and ignores browser marina ids", async ({ page }) => {
    const today = new Date();
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 30));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 33));
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);
    const query = new URLSearchParams({
      arrivalDate: isoDate(arrival),
      departureDate: isoDate(departure),
      eta: "14:30",
      etd: "10:00",
      marinaId: "e1000000-0000-4000-8000-000000000002",
      vesselBeamM: "20",
      vesselDraftM: "10",
      vesselLengthM: "99",
      vesselName: "Oversize Test",
    });

    await page.goto(`/marina/marina-a?${query.toString()}#booking-entry`);
    const result = page.locator("[data-availability='no_suitable_berth']");
    await expect(result).toContainText("Unavailable — vessel does not fit");
    await expect(result).not.toContainText(/d5000000|BK-|A-01|berth id|booking id|price/i);
    await expect(page.locator("[data-berth-id]")).toHaveCount(0);
    await expect(page.locator("[data-price-total-minor]")).toHaveCount(0);
  });

  test("public pricing applies each seasonal nightly rate across a boundary", async ({ page }) => {
    const query = new URLSearchParams({
      arrivalDate: "2026-09-30",
      departureDate: "2026-10-02",
      eta: "14:30",
      etd: "10:00",
      priceTotalMinor: "1",
      pricingCurrency: "USD",
      taxRateBps: "0",
      vesselBeamM: "3.8",
      vesselDraftM: "2.1",
      vesselLengthM: "12.5",
    });

    await page.goto(`/marina/marina-a?${query.toString()}#booking-entry`);
    const quote = page.locator("[data-price-total-minor='9272']");
    await expect(quote).toContainText("Baltic high season");
    await expect(quote).toContainText("Baltic autumn season");
    await expect(quote).toContainText("€92.72");
    await expect(page.locator("[data-booking-id], [data-hold-id]")).toHaveCount(0);
  });

  test("public customer can create and safely release a 15-minute capacity hold", async ({ page }) => {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    test.skip(!secretKey, "Requires the local server-only Supabase secret key.");
    const query = new URLSearchParams({
      arrivalDate: "2026-12-10",
      departureDate: "2026-12-12",
      eta: "14:30",
      etd: "10:00",
      vesselBeamM: "5.8",
      vesselDraftM: "3.1",
      vesselLengthM: "19",
      vesselName: "Hold UI Test",
    });
    await page.goto(`/marina/marina-a?${query.toString()}#booking-entry`);
    await page.getByRole("button", { name: "Continue to payment" }).click();

    const result = page.locator("[data-hold-token]");
    await expect(result).toContainText("Capacity is held for 15 minutes");
    await expect(result).toContainText("Hold expires at");
    await expect(page.getByRole("button", { name: "Capacity held" })).toBeDisabled();

    const holdToken = await result.getAttribute("data-hold-token");
    expect(holdToken).toMatch(/^[0-9a-f-]{36}$/i);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      secretKey!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await supabase.rpc("release_booking_hold_after_checkout_failure", {
      target_hold_token: holdToken!,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test("Stripe return stays pending until the signed webhook result is recorded", async ({ page }, testInfo) => {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    test.skip(!secretKey, "Requires the local server-only Supabase secret key.");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", secretKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const holdKey = crypto.randomUUID();
    const dateOffset = Number.parseInt(holdKey.replaceAll("-", "").slice(0, 8), 16) % 1_000;
    const arrival = new Date(Date.UTC(2035, 0, 1 + dateOffset));
    const departure = new Date(arrival);
    departure.setUTCDate(arrival.getUTCDate() + 2);
    const arrivalDate = arrival.toISOString().slice(0, 10);
    const departureDate = departure.toISOString().slice(0, 10);
    const sessionId = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const { data: holdRows, error: holdError } = await supabase.rpc("create_booking_hold", {
      target_marina_id: "d1000000-0000-4000-8000-000000000001", request_idempotency_key: holdKey,
      requested_arrival: arrivalDate, requested_departure: departureDate, requested_eta: "14:00", requested_etd: "10:00",
      requested_vessel_name: "Webhook Return", requested_length_m: 19, requested_beam_m: 5.8, requested_draft_m: 3.1,
      calculated_price_currency: "EUR", calculated_price_total_minor: 10000,
      calculated_price_snapshot: { version: 1, currency: "EUR", totalMinor: 10000, arrivalDate, departureDate, vesselLengthM: 19 },
      request_session_hash: "3".repeat(64), request_network_hash: "4".repeat(64),
    });
    expect(holdError).toBeNull();
    expect(holdRows?.[0].outcome).toBe("created");
    const holdToken = holdRows![0].hold_token!;
    const { data: prepared, error: prepareError } = await supabase.rpc("prepare_booking_checkout", { target_hold_token: holdToken });
    expect(prepareError).toBeNull();
    expect(prepared?.[0].outcome).toBe("ready");
    const { data: attached, error: attachError } = await supabase.rpc("attach_booking_checkout_session", { target_payment_id: prepared![0].payment_id!, target_session_id: sessionId });
    expect(attachError).toBeNull();
    expect(attached).toBe(true);

    await page.goto(`/marina/marina-a/checkout/return?session_id=${sessionId}`);
    await expect(page.getByRole("heading", { name: "Confirmation in progress" })).toBeVisible();
    await expect(page.getByText(/browser return does not confirm payment/i)).toBeVisible();

    const { error: eventError } = await supabase.rpc("process_stripe_checkout_event", {
      target_event_id: `evt_${crypto.randomUUID().replaceAll("-", "")}`, target_event_type: "checkout.session.completed",
      target_stripe_account_id: "acct_testmarinaa", target_session_id: sessionId, target_payment_intent_id: `pi_${testInfo.project.name}`,
      target_payment_status: "paid", target_amount_total_minor: 10000, target_currency: "eur", target_hold_token: holdToken,
      target_customer_name: "Webhook Return Guest", target_customer_email: "webhook-return@example.test",
      target_customer_phone: "+37120000000",
    });
    expect(eventError).toBeNull();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  });

  test("public availability distinguishes suitable capacity that is full", async ({ page }) => {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    test.skip(!secretKey, "Requires the local server-only Supabase secret key.");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      secretKey!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const today = new Date();
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 40));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 43));
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);
    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        arrival_date: isoDate(arrival),
        customer_email: "capacity-fixture@example.test",
        customer_name: "Capacity fixture",
        customer_phone: "+371 20000999",
        departure_date: isoDate(departure),
        eta: "14:00",
        etd: "10:00",
        marina_id: "d1000000-0000-4000-8000-000000000001",
        vessel_beam_m: 5.8,
        vessel_draft_m: 3.1,
        vessel_length_m: 19,
        vessel_name: "Capacity Fixture",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(booking).toBeTruthy();

    try {
      const query = new URLSearchParams({
        arrivalDate: isoDate(arrival),
        departureDate: isoDate(departure),
        eta: "15:00",
        etd: "09:00",
        vesselBeamM: "5.8",
        vesselDraftM: "3.1",
        vesselLengthM: "19",
      });
      await page.goto(`/marina/marina-a?${query.toString()}#booking-entry`);

      const result = page.locator("[data-availability='capacity_full']");
      await expect(result).toContainText("Unavailable — suitable capacity is full");
      await expect(result).not.toContainText(/d5000000|BK-|C-03|berth id|booking id|price/i);
    } finally {
      if (booking) await supabase.from("bookings").delete().eq("id", booking.id);
    }
  });

  test("booking search reports invalid stay and dimensions without losing input", async ({ page }) => {
    const today = new Date();
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 20));
    const isoDate = arrival.toISOString().slice(0, 10);

    await page.goto(
      `/marina/marina-a?arrivalDate=${isoDate}&departureDate=${isoDate}&eta=25%3A00&etd=10%3A00&vesselName=Kept+Name&vesselLengthM=0&vesselBeamM=3.8&vesselDraftM=2.1#booking-entry`,
    );

    await expect(page.getByText("Departure must be after arrival.")).toBeVisible();
    await expect(page.getByText("Enter a valid ETA in marina local time.")).toBeVisible();
    await expect(page.getByText(/Vessel length must be between/)).toBeVisible();
    await expect(page.getByLabel("Vessel name")).toHaveValue("Kept Name");
    await expect(page.getByLabel("Length (m)")).toHaveValue("0");
    await expect(page.locator("[data-search-ready='true']")).toHaveCount(0);
  });
});

test("protected dashboard routes preserve a safe return destination", async ({ page }) => {
  await page.goto("/dashboard/arrivals");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Farrivals$/);
});

test("public signup is disabled for invitation-only accounts", async ({ page }) => {
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/login$/);
});

test("callback failures stay on the Berthio origin", async ({ page }) => {
  await page.goto("/auth/callback?next=https://attacker.example");
  await expect(page).toHaveURL(/\/login\?error=invalid-callback$/);
});

test.describe("local Supabase marina auth", () => {
  test.skip(
    !process.env.E2E_SUPABASE_READY,
    "Requires a running local Supabase stack and an invited marina user.",
  );

  test("failed login shows a sanitized error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-a-user@example.com");
    await page.getByLabel("Password").fill("incorrect-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Email or password is incorrect.", { exact: true })).toBeVisible();
  });

  test("invited marina user can access the dashboard and log out", async ({ page }) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Marina dashboard" })).toBeVisible();
    await expect(page.locator(".overview-insight-card")).toHaveCount(3);
    await expect(page.locator("[data-berth-id]")).toHaveCount(12);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("marina admin can update profile contacts and IANA timezone", async ({ page }, testInfo) => {
    test.slow();
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires admin credentials.");

    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const contactEmail = `harbour-${suffix}@example.test`;
    let original: { contactEmail: string; contactPhone: string; timezone: string; websiteUrl: string } | null = null;

    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email!);
      await page.getByLabel("Password").fill(password!);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.getByRole("link", { name: "Settings" }).click();
      await expect(page.getByRole("heading", { name: "Marina settings" })).toBeVisible();

      original = {
        contactEmail: await page.getByLabel("Contact email").inputValue(),
        contactPhone: await page.getByLabel("Contact phone").inputValue(),
        timezone: await page.getByLabel("IANA timezone").inputValue(),
        websiteUrl: await page.getByLabel("Website").inputValue(),
      };
      const stalePage = await page.context().newPage();
      await stalePage.goto("/dashboard/settings");
      await expect(stalePage.getByRole("heading", { name: "Marina settings" })).toBeVisible();

      await page.getByLabel("Contact email").fill(contactEmail);
      await page.getByLabel("Contact phone").fill("+371 20 123 456");
      await page.getByLabel("Website").fill("https://marina.example/visitor");
      await page.getByLabel("IANA timezone").fill("Europe/London");
      await page.getByRole("button", { name: "Save marina profile" }).click();

      await expect(page.getByRole("status")).toHaveText("Marina profile updated.");
      await expect(page.locator(".app-status")).toContainText("Europe/London");

      await page.goto("/marina/marina-a");
      await expect(page.getByRole("link", { name: contactEmail })).toBeVisible();
      await expect(page.getByRole("link", { name: "+371 20 123 456" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Marina website" })).toHaveAttribute(
        "href",
        "https://marina.example/visitor",
      );

      await stalePage.getByLabel("Contact phone").fill("+371 20 999 999");
      await stalePage.getByRole("button", { name: "Save marina profile" }).click();
      await expect(stalePage.locator(".form-message[role='alert']")).toContainText(
        "This profile changed after the page was opened",
      );
      await stalePage.close();
    } finally {
      if (original) {
        await page.goto("/dashboard/settings");
        await page.getByLabel("Contact email").fill(original.contactEmail);
        await page.getByLabel("Contact phone").fill(original.contactPhone);
        await page.getByLabel("Website").fill(original.websiteUrl);
        await page.getByLabel("IANA timezone").fill(original.timezone);
        await page.getByRole("button", { name: "Save marina profile" }).click();
        await expect(page.getByRole("status")).toHaveText("Marina profile updated.");
      }
    }
  });

  test("marina admin can unpublish the public page without changing its slug flow", async ({ page }) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    test.skip(!email || !password || !secretKey || !supabaseUrl, "Requires admin credentials and the local server key.");
    const service = createClient(supabaseUrl!, secretKey!, { auth: { persistSession: false } });
    const users = await service.auth.admin.listUsers();
    const actor = users.data.users.find((user) => user.email === email);
    expect(users.error).toBeNull();
    expect(actor).toBeTruthy();

    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email!);
      await page.getByLabel("Password").fill(password!);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto("/dashboard/settings/publishing");
      await expect(page.getByRole("heading", { name: "Public page publishing" })).toBeVisible();
      await expect(page.getByText("Published", { exact: true })).toBeVisible();
      await expect(page.getByText("/marina/marina-a", { exact: false })).toBeVisible();

      await page.getByRole("button", { name: "Unpublish public page" }).click();
      await expect(page.locator(".form-message[role='status']")).toContainText("Public booking page unpublished");
      await page.goto("/marina/marina-a");
      await expect(page.locator("body")).toContainText("404");
    } finally {
      const marina = await service.from("marinas").select("updated_at").eq("id", "d1000000-0000-4000-8000-000000000001").single();
      expect(marina.error).toBeNull();
      const restored = await service.rpc("set_marina_publication_state", {
        target_marina_id: "d1000000-0000-4000-8000-000000000001",
        target_actor_id: actor!.id,
        expected_updated_at: marina.data!.updated_at,
        requested_public: true,
        integrations_ready: true,
      });
      expect(restored.error).toBeNull();
      expect(["updated", "unchanged"]).toContain(restored.data?.[0].outcome);
    }
  });

  test("marina staff can log in and open tenant-scoped operations", async ({ page }) => {
    const email = process.env.E2E_MARINA_STAFF_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina staff credentials.");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("MARINA STAFF", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await page.goto("/dashboard/settings");
    await expect(page.locator("body")).toContainText("404");
    await page.goto("/dashboard/settings/publishing");
    await expect(page.locator("body")).toContainText("404");
    await page.goto("/dashboard/bookings/new");
    await expect(page.getByRole("heading", { name: "Create manual booking" })).toBeVisible();
  });

  test("audit history gives admins a marina log and staff entity-level access", async ({ page }, testInfo) => {
    const adminEmail = process.env.E2E_MARINA_EMAIL;
    const staffEmail = process.env.E2E_MARINA_STAFF_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!adminEmail || !staffEmail || !password, "Requires invited admin and staff credentials.");

    await page.goto("/login");
    await page.getByLabel("Email").fill(adminEmail!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible();
    await page.getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Full marina history" })).toBeVisible();
    await expect(page.locator(".audit-event-list li").first()).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();

    await page.getByLabel("Email").fill(staffEmail!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
    await page.goto("/dashboard/audit");
    await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();

    const today = new Date();
    const offset = (testInfo.project.name === "mobile" ? 21_000 : 20_000) + (Date.now() % 500);
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset + 2));
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);
    await page.goto("/dashboard/bookings/new");
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("14:00");
    await page.getByLabel("ETD").fill("10:00");
    await page.getByLabel("Customer name").fill(`Audit E2E ${Date.now()}`);
    await page.getByLabel("Email").fill(`audit-${Date.now()}@example.test`);
    await page.getByLabel("Phone").fill("+371 20000808");
    await page.getByLabel("Vessel name").fill("Audit Logbook");
    await page.getByLabel("Length (m)").fill("8");
    await page.getByLabel("Beam (m)").fill("2.8");
    await page.getByLabel("Draft (m)").fill("1.4");
    await page.getByRole("button", { name: "Create booking" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Operational history" })).toBeVisible();
    await expect(page.getByText("booking / created", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Operational history").getByText(staffEmail!, { exact: true })).toBeVisible();
  });

  test("Marina A cannot open a Marina B berth by manipulated id", async ({ page }) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto(
      "/dashboard/berths/e5000000-0000-4000-8000-000000000001",
    );
    await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
    await expect(page.getByText("E-01", { exact: true })).toHaveCount(0);
  });

  test("password recovery reaches local Mailpit and opens the reset page", async ({
    page,
    request,
  }, testInfo) => {
    const email = process.env.E2E_RECOVERY_EMAIL;
    const passwordBase = process.env.E2E_RECOVERY_PASSWORD;
    test.skip(!email || !passwordBase, "Requires recovery-test marina credentials.");
    const password = `${passwordBase}-${testInfo.project.name}`;

    type MailpitSummary = {
      ID: string;
      To?: Array<{ Address?: string }>;
    };
    type MailpitList = { messages?: MailpitSummary[] };

    const initialResponse = await request.get(
      "http://127.0.0.1:54324/api/v1/messages",
    );
    expect(initialResponse.ok()).toBe(true);
    const initialMailbox = (await initialResponse.json()) as MailpitList;
    const existingMessageIds = new Set(
      initialMailbox.messages?.map((message) => message.ID) ?? [],
    );

    await page.goto("http://localhost:3000/forgot-password");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("a reset link is on its way");

    let message: MailpitSummary | undefined;
    await expect
      .poll(async () => {
        const response = await request.get("http://127.0.0.1:54324/api/v1/messages");
        expect(response.ok()).toBe(true);
        const mailbox = (await response.json()) as MailpitList;
        message = mailbox.messages?.find((candidate) =>
          !existingMessageIds.has(candidate.ID) &&
          candidate.To?.some((recipient) => recipient.Address === email),
        );
        return Boolean(message);
      })
      .toBe(true);

    const response = await request.get(
      `http://127.0.0.1:54324/api/v1/message/${message!.ID}`,
    );
    expect(response.ok()).toBe(true);
    const detail = (await response.json()) as { HTML?: string };
    const href = detail.HTML?.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    expect(href).toBeTruthy();

    await page.goto(href!);
    await expect(page).toHaveURL("http://localhost:3000/reset-password");
    await expect(page.getByRole("heading", { name: "Secure your account" })).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(password!);
    await page.getByLabel("Confirm new password").fill(password!);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(
      "http://localhost:3000/login?message=password-updated",
    );

    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL("http://localhost:3000/dashboard");
    await expect(page.getByText("Marina B / marina-b", { exact: true })).toBeVisible();
    await expect(page.getByText("Marina A / marina-a", { exact: true })).toHaveCount(0);
  });

  test("marina admin can create and operate a berth", async ({ page }) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");
    const code = `E2E-${Date.now().toString().slice(-8)}`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard/berths");
    await expect(page.getByRole("heading", { name: "Berth inventory" })).toBeVisible();
    await expect(page.getByText("A-01", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Add berth" }).click();
    await page.getByLabel("Berth code").fill(code);
    await page.getByLabel("Zone").fill("E2E Pier");
    await page.getByLabel("Maximum length (m)", { exact: true }).fill("17.5");
    await page.getByLabel("Maximum beam (m)", { exact: true }).fill("5.2");
    await page.getByLabel("Maximum draft (m)", { exact: true }).fill("2.9");
    await page.getByLabel("Priority").fill("7");
    await page.getByLabel("Status").selectOption("available");
    await page.getByLabel("Allow smaller vessels").uncheck();
    await page.getByRole("button", { name: "Create berth" }).click();

    await expect(page).toHaveURL(/\/dashboard\/berths\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: `Berth ${code}` })).toBeVisible();
    await expect(page.getByText("Not allowed", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Edit berth" }).click();
    await page.getByLabel("Zone").fill("E2E North Pier");
    await page.getByLabel("Status").selectOption("blocked");
    await page.getByRole("button", { name: "Save berth" }).click();
    await expect(page.getByText("Blocked", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E North Pier", { exact: true })).toBeVisible();
    await expect(page.getByText("17.50 m", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Edit berth" }).click();
    await page.getByLabel("Status").selectOption("out_of_service");
    await page.getByRole("button", { name: "Save berth" }).click();
    await expect(page.getByText("Out of service", { exact: true })).toBeVisible();
  });

  test("marina admin previews row errors and atomically imports berth CSV", async ({ page }, testInfo) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    test.skip(!email || !password || !supabaseUrl || !secretKey, "Requires admin credentials and the local server key.");
    const service = createClient(supabaseUrl!, secretKey!, { auth: { persistSession: false } });
    const suffix = `${testInfo.project.name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-7)}`;
    const codes = [`IMP-${suffix}-A`, `IMP-${suffix}-B`];
    const header = "berth_code,zone,max_length_m,max_beam_m,max_draft_m,status,priority,allow_smaller_vessels";

    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email!);
      await page.getByLabel("Password").fill(password!);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto("/dashboard/berths");
      await page.getByRole("link", { name: "Import CSV" }).click();
      await expect(page.getByRole("heading", { name: "Import berths" })).toBeVisible();

      await page.getByLabel("Berth inventory CSV").setInputFiles({
        name: "invalid-berths.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(`${header}\n${codes[0]},Test Pier,-1,4,2,reserved,10,true\n${codes[0]},Test Pier,12,4,2,available,11,true`),
      });
      const previewButton = page.getByRole("button", { name: "Preview import" });
      if (testInfo.project.name === "mobile") {
        await previewButton.evaluate((button) => {
          if (!(button instanceof HTMLButtonElement) || !(button.form instanceof HTMLFormElement)) {
            throw new Error("Preview submit button is not associated with a form.");
          }
          button.form.requestSubmit(button);
        });
      } else {
        await previewButton.click();
      }
      await expect(page.getByText("2 rows have errors. Nothing can be imported until every row is valid.")).toBeVisible();
      await expect(page.getByText(/duplicated in CSV rows 2, 3/).first()).toBeVisible();
      await expect(page.getByText(/Maximum length must be/)).toBeVisible();
      await expect(page.getByText(/Choose a valid operational status/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Import \d+ berths/ })).toHaveCount(0);

      await page.getByLabel("Berth inventory CSV").setInputFiles([]);
      await page.getByLabel("Berth inventory CSV").setInputFiles({
        name: "valid-berths.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(`${header}\n${codes[0]},Test Pier,12.5,4.2,2.1,available,310,true\n${codes[1]},Test Pier,14,4.8,2.4,out_of_service,311,false`),
      });
      if (testInfo.project.name === "mobile") {
        await previewButton.evaluate((button) => {
          if (!(button instanceof HTMLButtonElement) || !(button.form instanceof HTMLFormElement)) {
            throw new Error("Preview submit button is not associated with a form.");
          }
          button.form.requestSubmit(button);
        });
      } else {
        await previewButton.click();
      }
      await expect(page.getByText("2 berths are ready for atomic import.")).toBeVisible();
      await expect(page.getByText(codes[0], { exact: true })).toBeVisible();
      await expect(page.getByText(codes[1], { exact: true })).toBeVisible();
      const importButton = page.getByRole("button", { name: "Import 2 berths" });
      if (testInfo.project.name === "mobile") {
        await importButton.evaluate((button) => {
          if (!(button instanceof HTMLButtonElement) || !(button.form instanceof HTMLFormElement)) {
            throw new Error("Import submit button is not associated with a form.");
          }
          button.form.requestSubmit(button);
        });
      } else {
        await importButton.click();
      }
      await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
      await expect(page.getByText("2 berths were imported atomically. Existing berths were unchanged.")).toBeVisible();

      const imported = await service.from("berths").select("id,marina_id,code").in("code", codes).order("code");
      expect(imported.error).toBeNull();
      expect(imported.data).toHaveLength(2);
      expect(imported.data?.every((berth) => berth.marina_id === "d1000000-0000-4000-8000-000000000001")).toBe(true);
      const audit = await service.from("audit_events").select("actor_id,after_data").eq("event_type", "berth.created").in("berth_id", imported.data!.map((berth) => berth.id));
      expect(audit.error).toBeNull();
      expect(audit.data).toHaveLength(2);
      expect(audit.data?.every((event) => event.actor_id !== null)).toBe(true);
    } finally {
      const cleanup = await service.from("berths").delete().in("code", codes);
      expect(cleanup.error).toBeNull();
    }
  });

  test("marina admin can inspect and persist pilot map status", async ({ page }) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard/marina-map");

    await expect(page.getByRole("heading", { name: "Marina map" })).toBeVisible();
    await expect(page.locator("[data-berth-id]")).toHaveCount(12);
    await page.getByRole("button", { name: /Berth A-01/ }).click();
    await expect(page.getByRole("heading", { name: "Berth A-01" })).toBeVisible();
    await expect(page.getByText("8.00 m", { exact: true })).toBeVisible();

    await page.getByLabel("Operational status").selectOption("blocked");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Operational status updated.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Berth A-01, Blocked" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Berth A-01, Blocked" })).toBeVisible();
    await page.getByRole("button", { name: "Berth A-01, Blocked" }).click();
    await page.getByLabel("Operational status").selectOption("available");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByRole("button", { name: "Berth A-01, Available" })).toBeVisible();
  });

  test("marina staff previews and confirms a cancellation without an automatic refund", async ({ page }) => {
    test.slow();
    const email = process.env.E2E_MARINA_STAFF_EMAIL ?? process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");
    const arrival = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const departure = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000);
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard/bookings/new");
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("14:00");
    await page.getByLabel("ETD").fill("10:00");
    await page.getByLabel("Customer name").fill(`Cancellation E2E ${Date.now()}`);
    await page.getByLabel("Email").fill(`cancellation-${Date.now()}@example.test`);
    await page.getByLabel("Phone").fill("+371 20000999");
    await page.getByLabel("Vessel name").fill("Cancellation Test Vessel");
    await page.getByLabel("Length (m)").fill("8");
    await page.getByLabel("Beam (m)").fill("2.8");
    await page.getByLabel("Draft (m)").fill("1.4");
    await page.getByRole("button", { name: "Create booking" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]+$/, { timeout: 30_000 });

    await page.getByLabel("Booking status").selectOption("cancelled");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Cancellation review", { exact: true })).toBeVisible();
    await expect(page.getByText(/refund recommendation|refund recommended/i)).toBeVisible();
    await page.getByLabel("Cancellation reason").fill("Customer requested cancellation.");
    await page.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  });

  test("marina staff can assign and reassign a suitable real berth", async ({ page }, testInfo) => {
    test.slow();
    const email = process.env.E2E_MARINA_STAFF_EMAIL ?? process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");
    const today = new Date();
    const runOffset = (testInfo.project.name === "mobile" ? 16_000 : 6_000) + (Date.now() % 1_000);
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + runOffset));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + runOffset + 3));
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard/bookings/new");
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("14:30");
    await page.getByLabel("ETD").fill("10:00");
    await page.getByLabel("Customer name").fill(`Assignment E2E ${testInfo.project.name}`);
    await page.getByLabel("Email").fill(`assignment-${testInfo.project.name}@example.test`);
    await page.getByLabel("Phone").fill("+371 20000123");
    await page.getByLabel("Vessel name").fill("Assignment Test Vessel");
    await page.getByLabel("Length (m)").fill("8.5");
    await page.getByLabel("Beam (m)").fill("2.9");
    await page.getByLabel("Draft (m)").fill("1.5");
    await page.getByRole("button", { name: "Create booking" }).click();

    await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]+$/, { timeout: 30_000 });
    const bookingReference = (await page.locator("h1").textContent())?.trim();
    expect(bookingReference).toMatch(/^BK-[A-Z0-9]{10}$/);
    await expect(page.getByText("Capacity-based / unassigned", { exact: true })).toBeVisible();

    await page.getByLabel("Suitable operational berth").selectOption("d5000000-0000-4000-8000-000000000002");
    await page.getByRole("button", { name: "Assign berth" }).click();
    await expect(page.getByText("Berth A-02 assigned.", { exact: true })).toBeVisible();
    await expect(page.locator(".assignment-status-line").getByText("Berth A-02", { exact: true })).toBeVisible();

    const extendedDeparture = new Date(departure);
    extendedDeparture.setUTCDate(extendedDeparture.getUTCDate() + 1);
    await page.getByLabel("Departure date", { exact: true }).fill(isoDate(extendedDeparture));
    await page.getByLabel("ETA", { exact: true }).fill("15:15");
    await page.getByRole("button", { name: "Save booking changes" }).click();
    await expect(page.getByText(/changes saved.*current berth was revalidated and preserved/i)).toBeVisible();
    await expect(page.getByLabel("Departure date", { exact: true })).toHaveValue(isoDate(extendedDeparture));
    await expect(page.getByLabel("ETA", { exact: true })).toHaveValue("15:15");

    await page.getByLabel("Length (m)", { exact: true }).fill("10");
    await page.getByLabel("Beam (m)", { exact: true }).fill("3.2");
    await page.getByLabel("Draft (m)", { exact: true }).fill("1.7");
    await page.getByRole("button", { name: "Save booking changes" }).click();
    await expect(page.getByText(/current berth would become invalid/i)).toBeVisible();

    await page.getByLabel("Suitable operational berth").selectOption("d5000000-0000-4000-8000-000000000003");
    await page.getByRole("button", { name: "Reassign berth" }).click();
    await expect(page.getByText(/reassigned to berth A-03/i)).toBeVisible();
    await expect(page.locator(".assignment-history li")).toHaveCount(3);

    await page.goto("/dashboard/marina-map");
    await expect(page.getByRole("button", { name: "Berth A-03, Reserved" })).toBeVisible();
    await page.getByRole("button", { name: "Berth A-03, Reserved" }).click();
    const bookingLink = page.getByRole("link", { name: new RegExp(bookingReference!) });
    await expect(bookingLink).toBeVisible();
    await bookingLink.click();

    await page.getByRole("button", { name: "Confirm check-in" }).click();
    await expect(page.getByText("Checked in", { exact: true })).toBeVisible();
    await expect(page.getByText(/checked in at berth A-03/i)).toBeVisible();

    await page.goto("/dashboard/marina-map");
    await expect(page.getByRole("button", { name: "Berth A-03, Occupied" })).toBeVisible();
    await page.getByRole("button", { name: "Berth A-03, Occupied" }).click();
    await page.getByRole("link", { name: new RegExp(bookingReference!) }).click();

    await page.getByRole("button", { name: "Confirm check-out" }).click();
    await expect(page.getByText("Checked out", { exact: true })).toBeVisible();
    await expect(page.getByText(/checked out from berth A-03/i)).toBeVisible();

    await page.goto("/dashboard/marina-map");
    await expect(page.getByRole("button", { name: "Berth A-03, Available" })).toBeVisible();
  });

  test("marina staff previews and confirms an extension with a required berth move", async ({ page }, testInfo) => {
    test.slow();
    const email = process.env.E2E_MARINA_STAFF_EMAIL ?? process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    test.skip(!email || !password || !supabaseUrl || !secretKey, "Requires seeded marina credentials and the local server key.");
    const service = createClient(supabaseUrl!, secretKey!, { auth: { persistSession: false } });
    const today = new Date();
    const runOffset = (testInfo.project.name === "mobile" ? 28_000 : 18_000) + (Date.now() % 1_000);
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + runOffset));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + runOffset + 2));
    const extendedDeparture = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + runOffset + 4));
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);
    let bookingId: string | null = null;
    let blockerId: string | null = null;

    try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard/bookings/new");
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("14:30");
    await page.getByLabel("ETD").fill("10:00");
    await page.getByLabel("Customer name").fill(`Extension E2E ${testInfo.project.name}`);
    await page.getByLabel("Email").fill(`extension-${testInfo.project.name}@example.test`);
    await page.getByLabel("Phone").fill("+371 20000404");
    await page.getByLabel("Vessel name").fill("Extension Test Vessel");
    await page.getByLabel("Length (m)").fill("8.5");
    await page.getByLabel("Beam (m)").fill("2.9");
    await page.getByLabel("Draft (m)").fill("1.5");
    await page.getByRole("button", { name: "Create booking" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]+$/, { timeout: 30_000 });
    bookingId = page.url().split("/").at(-1)!;
    await page.getByLabel("Suitable operational berth").selectOption("d5000000-0000-4000-8000-000000000002");
    await page.getByRole("button", { name: "Assign berth" }).click();
    await expect(page.getByText("Berth A-02 assigned.", { exact: true })).toBeVisible();

    blockerId = crypto.randomUUID();
    const blockerInsert = await service.from("bookings").insert({
      id: blockerId,
      marina_id: "d1000000-0000-4000-8000-000000000001",
      arrival_date: isoDate(departure),
      departure_date: isoDate(extendedDeparture),
      eta: "14:00",
      etd: "10:00",
      customer_name: "Extension blocker",
      customer_email: `extension-blocker-${blockerId}@example.test`,
      customer_phone: "+371 20000405",
      vessel_name: "Blocker",
      vessel_length_m: 8.5,
      vessel_beam_m: 2.9,
      vessel_draft_m: 1.5,
      status: "confirmed",
    });
    expect(blockerInsert.error).toBeNull();
    const blockerAssignment = await service.from("booking_berth_assignments").insert({
      marina_id: "d1000000-0000-4000-8000-000000000001",
      booking_id: blockerId,
      berth_id: "d5000000-0000-4000-8000-000000000002",
      arrival_date: isoDate(departure),
      departure_date: isoDate(extendedDeparture),
    });
    expect(blockerAssignment.error).toBeNull();

    await page.getByLabel("New departure date").fill(isoDate(extendedDeparture));
    await page.getByRole("button", { name: "Preview extension" }).click();
    await expect(page.getByText(/berth A-02 cannot serve the added nights/i)).toBeVisible();
    await expect(page.getByText(`Move required after ${isoDate(departure)}`, { exact: true })).toBeVisible();
    await page.getByLabel("Planned move berth").selectOption("d5000000-0000-4000-8000-000000000003");
    await page.getByRole("button", { name: "Confirm extension and move" }).click();
    await expect(page.getByText(/planned move from berth A-02 to A-03 confirmed/i)).toBeVisible();
    await expect(page.getByText(isoDate(extendedDeparture), { exact: true }).first()).toBeVisible();

    const schedule = await service
      .from("booking_berth_assignments")
      .select("berth_id,arrival_date,departure_date,assignment_kind")
      .eq("booking_id", bookingId)
      .is("ended_at", null)
      .order("arrival_date");
    expect(schedule.error).toBeNull();
    expect(schedule.data).toEqual([
      expect.objectContaining({ berth_id: "d5000000-0000-4000-8000-000000000002", assignment_kind: "stay", departure_date: isoDate(departure) }),
      expect.objectContaining({ berth_id: "d5000000-0000-4000-8000-000000000003", assignment_kind: "planned_move", arrival_date: isoDate(departure), departure_date: isoDate(extendedDeparture) }),
    ]);
    } finally {
      const cleanupIds = [bookingId, blockerId].filter((value): value is string => value !== null);
      if (cleanupIds.length > 0) {
        const cleanup = await service.from("bookings").delete().in("id", cleanupIds);
        expect(cleanup.error).toBeNull();
      }
    }
  });

  test("marina user can create and manage a manual booking", async ({ page }, testInfo) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");
    const guestName = `E2E Transit Guest ${Date.now().toString().slice(-6)}`;
    const today = new Date();
    const projectOffset = testInfo.project.name === "mobile" ? 12_000 : 2_000;
    const runOffset = projectOffset + (Date.now() % 1_000);
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + runOffset));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + runOffset + 3));
    const isoDate = (value: Date) => value.toISOString().slice(0, 10);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Create booking" }).click();
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("14:30");
    await page.getByLabel("ETD").fill("10:00");
    await page.getByLabel("Customer name").fill(guestName);
    await page.getByLabel("Email").fill("transit@example.test");
    await page.getByLabel("Phone").fill("+371 20000009");
    await page.getByLabel("Vessel name").fill("Test Aurora");
    await page.getByLabel("Length (m)").fill("9.5");
    await page.getByLabel("Beam (m)").fill("3.1");
    await page.getByLabel("Draft (m)").fill("1.7");
    await page.getByRole("button", { name: "Create booking" }).click();

    await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]+$/);
    await expect(page.locator("h1")).toHaveText(/^BK-[A-Z0-9]{10}$/);
    await expect(page.getByText(guestName, { exact: true })).toBeVisible();
    await expect(page.getByText("Test Aurora", { exact: true })).toBeVisible();
    await expect(page.getByText("Manual", { exact: true })).toBeVisible();
    await expect(page.getByText("3", { exact: true })).toBeVisible();

    const bookingUrl = page.url();
    await page.goto("/dashboard");
    await expect(page.locator(".overview-activity-panel")).toContainText(guestName);
    await page.goto(bookingUrl);

    await page.getByLabel(/exceptional check-in without an assigned berth/i).check();
    await page.getByRole("button", { name: "Confirm check-in" }).click();
    await expect(page.getByText("Checked in", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Back to bookings" }).click();
    await expect(page.getByText(guestName, { exact: true })).toBeVisible();
    await expect(page.getByText("Checked in", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Create booking" }).click();
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("16:00");
    await page.getByLabel("ETD").fill("08:00");
    await page.getByLabel("Customer name").fill("Scarce Large Berth Guest");
    await page.getByLabel("Email").fill("large-one@example.test");
    await page.getByLabel("Phone").fill("+371 20000011");
    await page.getByLabel("Vessel name").fill("Large One");
    await page.getByLabel("Length (m)").fill("19");
    await page.getByLabel("Beam (m)").fill("5.8");
    await page.getByLabel("Draft (m)").fill("3.1");
    await page.getByRole("button", { name: "Create booking" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]+$/);
    await expect(page.getByText("Large One", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Back to bookings" }).click();
    await page.getByRole("link", { name: "Create booking" }).click();
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("17:00");
    await page.getByLabel("ETD").fill("09:00");
    await page.getByLabel("Customer name").fill("Competing Large Berth Guest");
    await page.getByLabel("Email").fill("large-two@example.test");
    await page.getByLabel("Phone").fill("+371 20000012");
    await page.getByLabel("Vessel name").fill("Large Two");
    await page.getByLabel("Length (m)").fill("19");
    await page.getByLabel("Beam (m)").fill("5.8");
    await page.getByLabel("Draft (m)").fill("3.1");
    await page.getByRole("button", { name: "Create booking" }).click();
    await expect(page.getByText(
      "No safe berth capacity is available for this vessel and stay.",
      { exact: true },
    )).toBeVisible();

    await page.goto("/dashboard/bookings/new");
    await page.getByLabel("Arrival date").fill(isoDate(arrival));
    await page.getByLabel("Departure date").fill(isoDate(departure));
    await page.getByLabel("ETA").fill("15:00");
    await page.getByLabel("ETD").fill("09:00");
    await page.getByLabel("Customer name").fill("Oversize Vessel Guest");
    await page.getByLabel("Email").fill("oversize@example.test");
    await page.getByLabel("Phone").fill("+371 20000010");
    await page.getByLabel("Length (m)").fill("99");
    await page.getByLabel("Beam (m)").fill("20");
    await page.getByLabel("Draft (m)").fill("10");
    await page.getByRole("button", { name: "Create booking" }).click();
    await expect(page.getByText(
      "No safe berth capacity is available for this vessel and stay.",
      { exact: true },
    )).toBeVisible();
  });
});
