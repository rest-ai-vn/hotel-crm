import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_USER_EMAIL;
const PASSWORD = process.env.E2E_USER_PASSWORD;

test.describe("Authentication", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_USER_EMAIL / E2E_USER_PASSWORD not set");

  test("login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/mật khẩu|password/i).fill(PASSWORD!);
    await page.getByRole("button", { name: /đăng nhập|log in/i }).click();

    await expect(page).toHaveURL(/\/(rooms|reservations)?$|\/$/);
    await expect(page.getByRole("heading", { name: /tổng quan|phòng/i })).toBeVisible();
  });

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("not-a-user@example.com");
    await page.getByLabel(/mật khẩu|password/i).fill("wrong-password-123");
    await page.getByRole("button", { name: /đăng nhập|log in/i }).click();

    await expect(page.locator("text=/sai|invalid|không|incorrect/i")).toBeVisible({
      timeout: 8_000,
    });
  });

  test("protected route redirects to login when unauthenticated", async ({ page, context }) => {
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto("/reservations");
    await expect(page).toHaveURL(/\/login/);
  });
});
