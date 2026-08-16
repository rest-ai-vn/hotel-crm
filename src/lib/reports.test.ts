import { test, expect, describe } from "bun:test";
import { computeRevenueKpis, daysInRange } from "./reports";

describe("daysInRange", () => {
  test("inclusive day count", () => {
    expect(daysInRange("2026-06-01", "2026-06-01")).toBe(1);
    expect(daysInRange("2026-06-01", "2026-06-30")).toBe(30);
    expect(daysInRange("2026-06-01", "2026-07-01")).toBe(31);
  });
  test("invalid → 1", () => {
    expect(daysInRange("bad", "2026-06-01")).toBe(1);
  });
});

describe("computeRevenueKpis", () => {
  test("ADR = room revenue / nights sold", () => {
    // 10 nights sold, 7,020,000đ room revenue → ADR 702,000
    const k = computeRevenueKpis(7_020_000, 0, 10, 5, 30);
    expect(k.adr).toBe(702_000);
  });
  test("RevPAR = room revenue / available room-nights", () => {
    // 5 rooms × 30 days = 150 available; 7,020,000 / 150 = 46,800
    const k = computeRevenueKpis(7_020_000, 0, 10, 5, 30);
    expect(k.available_room_nights).toBe(150);
    expect(k.revpar).toBe(46_800);
  });
  test("occupancy %", () => {
    // 75 sold / 150 available = 50%
    const k = computeRevenueKpis(1_000_000, 0, 75, 5, 30);
    expect(k.occupancy_pct).toBe(50);
  });
  test("total revenue = room + service", () => {
    const k = computeRevenueKpis(1_000_000, 250_000, 2, 5, 1);
    expect(k.total_revenue).toBe(1_250_000);
  });
  test("zero rooms/nights → no divide-by-zero", () => {
    const k = computeRevenueKpis(0, 0, 0, 0, 1);
    expect(k.adr).toBe(0);
    expect(k.revpar).toBe(0);
    expect(k.occupancy_pct).toBe(0);
  });
});
