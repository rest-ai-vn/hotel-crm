import { describe, expect, test } from "bun:test";
import { calculatePrice, pickActiveRatePlan, type RatePlan } from "./pricing";

const overnight: RatePlan = {
  booking_type: "overnight",
  hourly_rate: null,
  overnight_rate: 350_000,
  daytime_rate: null,
  min_hours: 1,
  extra_hour_rate: null,
  weekend_surcharge_pct: 0,
};

const overnightWithWeekend: RatePlan = {
  ...overnight,
  weekend_surcharge_pct: 20,
};

const hourly: RatePlan = {
  booking_type: "hourly",
  hourly_rate: 100_000,
  overnight_rate: null,
  daytime_rate: null,
  min_hours: 2,
  extra_hour_rate: 60_000,
  weekend_surcharge_pct: 0,
};

const daytime: RatePlan = {
  booking_type: "daytime",
  hourly_rate: null,
  overnight_rate: null,
  daytime_rate: 200_000,
  min_hours: 1,
  extra_hour_rate: null,
  weekend_surcharge_pct: 25,
};

describe("calculatePrice — overnight", () => {
  test("single weekday night", () => {
    const r = calculatePrice(overnight, {
      check_in: "2026-05-04",
      check_out: "2026-05-05",
    });
    expect(r.base).toBe(350_000);
    expect(r.surcharge).toBe(0);
    expect(r.total).toBe(350_000);
    expect(r.details.nights).toBe(1);
    expect(r.details.weekend_nights).toBe(0);
  });

  test("3 weekday nights", () => {
    const r = calculatePrice(overnight, {
      check_in: "2026-05-04",
      check_out: "2026-05-07",
    });
    expect(r.base).toBe(1_050_000);
    expect(r.total).toBe(1_050_000);
    expect(r.details.nights).toBe(3);
  });

  test("weekend surcharge applies only to Sat/Sun", () => {
    const r = calculatePrice(overnightWithWeekend, {
      check_in: "2026-05-08",
      check_out: "2026-05-11",
    });
    expect(r.details.nights).toBe(3);
    expect(r.details.weekend_nights).toBe(2);
    expect(r.base).toBe(1_050_000);
    expect(r.surcharge).toBe(140_000);
    expect(r.total).toBe(1_190_000);
  });

  test("same-day check-in/out treated as 1 night minimum", () => {
    const r = calculatePrice(overnight, {
      check_in: "2026-05-04",
      check_out: "2026-05-04",
    });
    expect(r.details.nights).toBe(1);
    expect(r.total).toBe(350_000);
  });

  test("throws when overnight_rate is missing", () => {
    expect(() =>
      calculatePrice(
        { ...overnight, overnight_rate: null },
        { check_in: "2026-05-04", check_out: "2026-05-05" },
      ),
    ).toThrow();
  });
});

describe("calculatePrice — hourly", () => {
  test("min hours billed when duration omitted", () => {
    const r = calculatePrice(hourly, {
      check_in: "2026-05-04",
      check_out: "2026-05-04",
    });
    expect(r.details.hours).toBe(2);
    expect(r.total).toBe(200_000);
  });

  test("extra hours use extra_hour_rate", () => {
    const r = calculatePrice(hourly, {
      check_in: "2026-05-04",
      check_out: "2026-05-04",
      duration_hours: 5,
    });
    expect(r.details.hours).toBe(5);
    expect(r.base).toBe(2 * 100_000 + 3 * 60_000);
    expect(r.total).toBe(380_000);
  });

  test("duration below min_hours rounds up to min_hours", () => {
    const r = calculatePrice(hourly, {
      check_in: "2026-05-04",
      check_out: "2026-05-04",
      duration_hours: 1,
    });
    expect(r.details.hours).toBe(2);
  });
});

describe("calculatePrice — daytime", () => {
  test("weekday daytime", () => {
    const r = calculatePrice(daytime, {
      check_in: "2026-05-04",
      check_out: "2026-05-04",
    });
    expect(r.base).toBe(200_000);
    expect(r.surcharge).toBe(0);
  });

  test("weekend daytime applies surcharge once", () => {
    const r = calculatePrice(daytime, {
      check_in: "2026-05-09",
      check_out: "2026-05-09",
    });
    expect(r.base).toBe(200_000);
    expect(r.surcharge).toBe(50_000);
    expect(r.total).toBe(250_000);
  });
});

describe("pickActiveRatePlan", () => {
  test("returns null on empty input", () => {
    expect(pickActiveRatePlan([], "2026-05-04")).toBeNull();
  });

  test("filters out inactive plans", () => {
    const plans = [
      { ...overnight, is_active: false, priority: 100 },
      { ...overnight, is_active: true, priority: 50 },
    ];
    const picked = pickActiveRatePlan(plans, "2026-05-04");
    expect(picked?.priority).toBe(50);
  });

  test("filters out plans outside validity window", () => {
    const plans = [
      { ...overnight, valid_from: "2026-06-01", priority: 100 },
      { ...overnight, valid_from: "2026-01-01", valid_to: "2026-12-31", priority: 50 },
    ];
    const picked = pickActiveRatePlan(plans, "2026-05-04");
    expect(picked?.priority).toBe(50);
  });

  test("picks highest priority among valid plans", () => {
    const plans = [
      { ...overnight, valid_from: "2026-01-01", priority: 10 },
      { ...overnight, valid_from: "2026-01-01", priority: 200 },
      { ...overnight, valid_from: "2026-01-01", priority: 50 },
    ];
    const picked = pickActiveRatePlan(plans, "2026-05-04");
    expect(picked?.priority).toBe(200);
  });
});
