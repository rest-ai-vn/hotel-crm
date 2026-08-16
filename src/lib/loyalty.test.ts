import { test, expect, describe } from "bun:test";
import { computeTier, pointsForAmount, visitsToNextTier } from "./loyalty";

describe("computeTier", () => {
  test("standard for 0-4 visits", () => {
    expect(computeTier(0)).toBe("standard");
    expect(computeTier(4)).toBe("standard");
  });
  test("silver at 5-9", () => {
    expect(computeTier(5)).toBe("silver");
    expect(computeTier(9)).toBe("silver");
  });
  test("gold at 10-19", () => {
    expect(computeTier(10)).toBe("gold");
    expect(computeTier(19)).toBe("gold");
  });
  test("platinum at 20+", () => {
    expect(computeTier(20)).toBe("platinum");
    expect(computeTier(999)).toBe("platinum");
  });
  test("negative / fractional clamped", () => {
    expect(computeTier(-3)).toBe("standard");
    expect(computeTier(5.9)).toBe("silver");
  });
});

describe("pointsForAmount", () => {
  test("1 point per 10,000đ", () => {
    expect(pointsForAmount(10_000)).toBe(1);
    expect(pointsForAmount(25_000)).toBe(2); // floor
    expect(pointsForAmount(702_000)).toBe(70);
  });
  test("zero/negative/invalid → 0", () => {
    expect(pointsForAmount(0)).toBe(0);
    expect(pointsForAmount(-5000)).toBe(0);
    expect(pointsForAmount(NaN)).toBe(0);
  });
});

describe("visitsToNextTier", () => {
  test("counts up to next threshold", () => {
    expect(visitsToNextTier(0)).toBe(5); // → silver
    expect(visitsToNextTier(4)).toBe(1);
    expect(visitsToNextTier(5)).toBe(5); // → gold at 10
    expect(visitsToNextTier(19)).toBe(1); // → platinum at 20
  });
  test("0 when already platinum", () => {
    expect(visitsToNextTier(20)).toBe(0);
    expect(visitsToNextTier(100)).toBe(0);
  });
});
