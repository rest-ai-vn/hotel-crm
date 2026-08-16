import { describe, expect, test } from "bun:test";
import { computePaidTotal, computeRemaining } from "./folio";

const p = (amount: number, kind: "payment" | "deposit" | "refund") => ({ amount, kind });

describe("computePaidTotal", () => {
  test("sums payments and deposits", () => {
    expect(computePaidTotal([p(100_000, "payment"), p(50_000, "deposit")])).toBe(150_000);
  });

  test("refunds subtract", () => {
    expect(computePaidTotal([p(200_000, "payment"), p(50_000, "refund")])).toBe(150_000);
  });

  test("empty list is zero", () => {
    expect(computePaidTotal([])).toBe(0);
  });

  test("legacy rows without kind count as payment", () => {
    expect(computePaidTotal([{ amount: 80_000 }])).toBe(80_000);
  });

  test("all-refund folio can go negative (over-refund visible)", () => {
    expect(computePaidTotal([p(30_000, "refund")])).toBe(-30_000);
  });
});

describe("computeRemaining", () => {
  test("remaining = folio total - paid, floored at 0", () => {
    expect(computeRemaining(500_000, [p(200_000, "deposit")])).toBe(300_000);
    expect(computeRemaining(500_000, [p(600_000, "payment")])).toBe(0);
  });
});
