import { describe, expect, test } from "bun:test";
import { buildVietQrUrl, computeVat, voucherDiscount, voucherError, type VoucherLike } from "./billing";

const base: VoucherLike = {
  kind: "percent",
  value: 10,
  valid_from: "2026-01-01",
  valid_to: null,
  max_uses: null,
  used_count: 0,
  is_active: true,
};

describe("voucherError", () => {
  test("valid voucher returns null", () => {
    expect(voucherError(base, "2026-08-16")).toBeNull();
  });
  test("inactive voucher rejected", () => {
    expect(voucherError({ ...base, is_active: false }, "2026-08-16")).toContain("hiệu lực");
  });
  test("before valid_from rejected", () => {
    expect(voucherError({ ...base, valid_from: "2026-09-01" }, "2026-08-16")).toContain("hiệu lực");
  });
  test("after valid_to rejected", () => {
    expect(voucherError({ ...base, valid_to: "2026-08-01" }, "2026-08-16")).toContain("hết hạn");
  });
  test("used up rejected", () => {
    expect(voucherError({ ...base, max_uses: 5, used_count: 5 }, "2026-08-16")).toContain("lượt");
  });
});

describe("voucherDiscount", () => {
  test("percent voucher", () => {
    expect(voucherDiscount({ ...base, kind: "percent", value: 10 }, 500_000)).toBe(50_000);
  });
  test("fixed voucher", () => {
    expect(voucherDiscount({ ...base, kind: "fixed", value: 100_000 }, 500_000)).toBe(100_000);
  });
  test("fixed voucher capped at amount", () => {
    expect(voucherDiscount({ ...base, kind: "fixed", value: 900_000 }, 500_000)).toBe(500_000);
  });
});

describe("computeVat", () => {
  test("10% VAT", () => {
    expect(computeVat(450_000, 10)).toBe(45_000);
  });
  test("0% VAT", () => {
    expect(computeVat(450_000, 0)).toBe(0);
  });
  test("negative amount clamps to 0", () => {
    expect(computeVat(-100, 10)).toBe(0);
  });
});

describe("buildVietQrUrl", () => {
  test("builds img.vietqr.io quicklink with amount and memo", () => {
    const url = buildVietQrUrl({
      bankId: "VCB",
      accountNo: "0123456789",
      accountName: "KHACH SAN ABC",
      amount: 500_000,
      memo: "BON-260816-XYZ",
    });
    expect(url).toContain("img.vietqr.io/image/VCB-0123456789-compact2.png");
    expect(url).toContain("amount=500000");
    expect(url).toContain("addInfo=BON-260816-XYZ");
    expect(url).toContain("accountName=KHACH+SAN+ABC");
  });
});
