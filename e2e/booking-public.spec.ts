import { expect, test } from "@playwright/test";

// Public booking engine flow. Safe against any environment: the submit test
// fills the hidden honeypot field, so the server returns a fake confirmation
// and stores nothing.
const HOTEL_CODE = process.env.E2E_HOTEL_CODE ?? "DEMO";

test.describe("Public booking engine", () => {
  test("hotel page renders room types", async ({ page }) => {
    await page.goto(`/book?hotel=${HOTEL_CODE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("button.card").first()).toBeVisible({ timeout: 8_000 });
  });

  test("selecting a room type shows a live quote", async ({ page }) => {
    await page.goto(`/book?hotel=${HOTEL_CODE}`);
    await page.locator("button.card").first().click();
    await expect(page.locator("text=/₫/").first()).toBeVisible({ timeout: 8_000 });
  });

  test("missing hotel code shows a friendly message", async ({ page }) => {
    await page.goto("/book");
    await expect(page.locator("text=/hotel=|thiếu mã|missing/i")).toBeVisible();
  });

  test("EN language toggle switches labels", async ({ page }) => {
    await page.goto(`/book?hotel=${HOTEL_CODE}`);
    await page.getByRole("button", { name: "EN" }).click();
    await expect(page.locator("text=Check-in")).toBeVisible();
    await page.getByRole("button", { name: "VI" }).click();
    await expect(page.locator("text=Nhận phòng")).toBeVisible();
  });

  test("bot submit (honeypot) gets a fake code and stores nothing", async ({ page }) => {
    await page.goto(`/book?hotel=${HOTEL_CODE}`);
    await page.locator("button.card").first().click();
    await expect(page.locator("text=/₫/").first()).toBeVisible({ timeout: 8_000 });

    await page.getByPlaceholder(/họ tên|full name/i).fill("E2E Bot Check");
    await page.getByPlaceholder(/số điện thoại|phone/i).fill("0900000001");
    // Fill the hidden honeypot the way a naive bot would.
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      const hidden = inputs.find((i) => i.getAttribute("aria-hidden") === "true");
      if (hidden) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set!;
        setter.call(hidden, "spam-bot");
        hidden.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.getByRole("button", { name: /đặt phòng|book now/i }).last().click();

    await expect(page.locator("text=BON-000000-BOT")).toBeVisible({ timeout: 8_000 });
  });
});
