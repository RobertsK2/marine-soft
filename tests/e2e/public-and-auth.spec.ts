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
});
