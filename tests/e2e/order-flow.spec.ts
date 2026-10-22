import { expect, test } from "@playwright/test";

/**
 * Requires a running app with seeded demo data:
 *   npm run db:seed && npm run dev
 *   E2E_EMAIL=demo@amplifi.local E2E_PASSWORD=... npx playwright test
 *
 * Uses the mock payment adapter; never contacts Instagram or Razorpay.
 */
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("customer purchase flow", () => {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD (see .data/seed-credentials.txt).");

  test("registers a session, orders a service and sees a labelled report", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/services/instagram-reel-views");
    await page.getByLabel(/instagram/i).first().fill("https://www.instagram.com/reel/CxAbCdEf123/");
    const quantity = page.getByLabel(/quantity|target/i).first();
    await quantity.fill("5000");

    await page.getByRole("button", { name: /start order|continue/i }).first().click();
    await expect(page).toHaveURL(/checkout/, { timeout: 30_000 });

    await page.getByRole("button", { name: /simulated|pay ₹/i }).first().click();
    await expect(page).toHaveURL(/dashboard\/orders\/AMP-/, { timeout: 30_000 });
    await expect(page.getByText(/payment verified|paid/i).first()).toBeVisible();

    await page.getByRole("link", { name: /campaign report/i }).click({ trial: true }).catch(() => undefined);
    await page.goto(page.url().replace(/\?.*$/, "") + "/report");
    await expect(page.getByText(/DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Metric unavailable|Verified|Provider reported/i).first()).toBeVisible();
  });

  test("unauthenticated visitors are redirected away from the dashboard", async ({ page }) => {
    await page.goto("/dashboard/orders");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
