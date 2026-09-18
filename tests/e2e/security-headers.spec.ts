import { expect, test } from "@playwright/test";

test("public, auth and protected responses carry security headers without breaking login", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      document.documentElement.dataset.cspViolation = event.violatedDirective;
    });
  });
  for (const path of ["/marina/marina-a", "/login", "/dashboard"]) {
    const direct = await page.request.get(path, { maxRedirects: 0 });
    const headerNames = ["content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy", "permissions-policy", "x-frame-options"];
    await testInfo.attach(`headers-${path.replaceAll("/", "_")}`, {
      body: JSON.stringify({ path, status: direct.status(), headers: Object.fromEntries(
        headerNames.map((name) => [name, direct.headers()[name] ?? null]),
      ) }, null, 2),
      contentType: "application/json",
    });
    expect(direct.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(direct.headers()["x-content-type-options"]).toBe("nosniff");
    if (path === "/dashboard") expect([302, 303, 307, 308]).toContain(direct.status());
    const response = await page.goto(path);
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-frame-options"]).toBe("DENY");
    if (process.env.E2E_PRODUCTION === "1") {
      expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
    }
    await expect(page.locator("html")).not.toHaveAttribute("data-csp-violation");
  }
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
});
