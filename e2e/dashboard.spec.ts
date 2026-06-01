import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_USER_EMAIL;
const PASSWORD = process.env.E2E_USER_PASSWORD;

test.describe("Dashboard", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_USER_EMAIL / E2E_USER_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/mật khẩu|password/i).fill(PASSWORD!);
    await page.getByRole("button", { name: /đăng nhập|log in/i }).click();
    await page.waitForURL(/\/$|\/rooms/);
  });

  test("renders KPI cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /tổng quan/i })).toBeVisible();
    await expect(page.getByText(/công suất/i)).toBeVisible();
    await expect(page.getByText(/khách lưu trú/i)).toBeVisible();
    await expect(page.getByText(/nhận phòng hôm nay/i)).toBeVisible();
    await expect(page.getByText(/trả phòng hôm nay/i)).toBeVisible();
  });

  test("chat widget toggle", async ({ page }) => {
    await page.goto("/");
    const chatBtn = page.getByRole("button", { name: /trợ lý ai/i });
    await expect(chatBtn).toBeVisible();
    await chatBtn.click();
    await expect(page.getByPlaceholder(/nhập câu hỏi/i)).toBeVisible();
  });

  test("housekeeping page loads", async ({ page }) => {
    await page.goto("/housekeeping");
    await expect(page.getByRole("heading", { name: /buồng phòng/i })).toBeVisible();
  });
});
