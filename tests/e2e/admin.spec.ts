import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

test.describe("admin console", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.");

  test("admin can review orders and provider health", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/);

    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { name: /orders/i })).toBeVisible();

    await page.goto("/admin/providers");
    const rows = page.locator("text=Demo simulator").first();
    await expect(rows).toBeVisible();
    await expect(page.getByText(/unconfigured/i).first()).toBeVisible();
  });

  test("customers cannot reach the admin console", async ({ page }) => {
    test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "Customer credentials not set.");
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
