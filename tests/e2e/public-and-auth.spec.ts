import { expect, test } from "@playwright/test";

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

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("password recovery reaches local Mailpit and opens the reset page", async ({
    page,
    request,
  }) => {
    const email = process.env.E2E_RECOVERY_EMAIL;
    const password = process.env.E2E_RECOVERY_PASSWORD;
    test.skip(!email || !password, "Requires recovery-test marina credentials.");

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

  test("marina user can create and manage a manual booking", async ({ page }) => {
    const email = process.env.E2E_MARINA_EMAIL;
    const password = process.env.E2E_MARINA_PASSWORD;
    test.skip(!email || !password, "Requires invited marina credentials.");
    const guestName = `E2E Transit Guest ${Date.now().toString().slice(-6)}`;
    const today = new Date();
    const arrival = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 30));
    const departure = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 33));
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

    await page.getByLabel("Booking status").selectOption("checked_in");
    await page.getByRole("button", { name: "Update status" }).click();
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
