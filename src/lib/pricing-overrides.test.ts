import { describe, expect, test } from "bun:test";
import { calculatePriceWithOverrides, type RateOverride, type RatePlan } from "./pricing";

const overnightPlan: RatePlan = {
  booking_type: "overnight",
  hourly_rate: null,
  overnight_rate: 500_000,
  daytime_rate: null,
  min_hours: 1,
  extra_hour_rate: null,
  weekend_surcharge_pct: 0,
};

const hourlyPlan: RatePlan = {
  booking_type: "hourly",
  hourly_rate: 100_000,
  overnight_rate: null,
  daytime_rate: null,
  min_hours: 1,
  extra_hour_rate: 50_000,
  weekend_surcharge_pct: 0,
};

const ov = (date: string, extra: Partial<RateOverride> = {}): RateOverride => ({
  date,
  room_type_id: null,
  surcharge_pct: 0,
  fixed_hourly: null,
  fixed_overnight: null,
  fixed_daytime: null,
  ...extra,
});

describe("calculatePriceWithOverrides", () => {
  test("no overrides → same as base price", () => {
    const r = calculatePriceWithOverrides(
      overnightPlan,
      { check_in: "2026-09-01", check_out: "2026-09-03" },
      [],
    );
    expect(r.total).toBe(1_000_000);
    expect(r.override_surcharge).toBe(0);
  });

  test("percent surcharge applies only to matching nights", () => {
    // 2026-09-01 → 2026-09-03 = 2 nights (01, 02). Holiday on 02: +50%
    const r = calculatePriceWithOverrides(
      overnightPlan,
      { check_in: "2026-09-01", check_out: "2026-09-03" },
      [ov("2026-09-02", { surcharge_pct: 50, name: "Lễ 2/9" })],
    );
    expect(r.override_surcharge).toBe(250_000);
    expect(r.total).toBe(1_250_000);
    expect(r.applied_overrides).toEqual(["Lễ 2/9"]);
  });

  test("fixed overnight rate replaces base rate for that night", () => {
    const r = calculatePriceWithOverrides(
      overnightPlan,
      { check_in: "2026-09-01", check_out: "2026-09-03" },
      [ov("2026-09-01", { fixed_overnight: 800_000, name: "Countdown" })],
    );
    // night 1: 800k (fixed), night 2: 500k
    expect(r.total).toBe(1_300_000);
  });

  test("hourly booking uses check_in date override", () => {
    const r = calculatePriceWithOverrides(
      hourlyPlan,
      { check_in: "2026-09-02", check_out: "2026-09-02", duration_hours: 3 },
      [ov("2026-09-02", { surcharge_pct: 20 })],
    );
    // base = 100k + 2×50k = 200k, +20% = 240k
    expect(r.total).toBe(240_000);
  });

  test("hourly fixed rate replaces base hourly total", () => {
    const r = calculatePriceWithOverrides(
      hourlyPlan,
      { check_in: "2026-09-02", check_out: "2026-09-02", duration_hours: 1 },
      [ov("2026-09-02", { fixed_hourly: 150_000 })],
    );
    expect(r.total).toBe(150_000);
  });

  test("inactive or other-date overrides ignored", () => {
    const r = calculatePriceWithOverrides(
      overnightPlan,
      { check_in: "2026-09-01", check_out: "2026-09-02" },
      [ov("2026-09-05", { surcharge_pct: 100 })],
    );
    expect(r.total).toBe(500_000);
  });
});
