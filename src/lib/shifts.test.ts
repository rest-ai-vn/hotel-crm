import { describe, expect, test } from "bun:test";
import { computeShiftCashSummary } from "./shifts";

describe("computeShiftCashSummary", () => {
  test("expected cash = opening + cash in - cash refunds + cashbook net", () => {
    const s = computeShiftCashSummary({
      openingCash: 500_000,
      payments: [
        { amount: 300_000, method: "cash", kind: "payment" },
        { amount: 200_000, method: "cash", kind: "deposit" },
        { amount: 150_000, method: "transfer", kind: "payment" }, // not cash → excluded
        { amount: 100_000, method: "cash", kind: "refund" },
      ],
      cashbookIncome: 50_000,
      cashbookExpense: 80_000,
    });
    // 500k + 300k + 200k - 100k + 50k - 80k = 870k
    expect(s.expected_cash).toBe(870_000);
    expect(s.cash_collected).toBe(500_000);
    expect(s.cash_refunded).toBe(100_000);
    expect(s.noncash_collected).toBe(150_000);
  });

  test("empty shift", () => {
    const s = computeShiftCashSummary({
      openingCash: 200_000,
      payments: [],
      cashbookIncome: 0,
      cashbookExpense: 0,
    });
    expect(s.expected_cash).toBe(200_000);
    expect(s.cash_collected).toBe(0);
  });

  test("legacy payments without kind count as cash payment", () => {
    const s = computeShiftCashSummary({
      openingCash: 0,
      payments: [{ amount: 70_000, method: "cash" }],
      cashbookIncome: 0,
      cashbookExpense: 0,
    });
    expect(s.expected_cash).toBe(70_000);
  });
});
