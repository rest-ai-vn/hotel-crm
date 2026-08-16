export type BookingType = "hourly" | "overnight" | "daytime";

export interface RatePlan {
  booking_type: BookingType;
  hourly_rate: number | null;
  overnight_rate: number | null;
  daytime_rate: number | null;
  min_hours: number;
  extra_hour_rate: number | null;
  weekend_surcharge_pct: number;
}

export interface PriceQuery {
  check_in: string;
  check_out: string;
  check_in_time?: string;
  check_out_time?: string;
  duration_hours?: number;
}

export interface PriceBreakdown {
  base: number;
  surcharge: number;
  total: number;
  details: {
    nights: number;
    hours: number;
    weekend_nights: number;
    applied_rate: "hourly_rate" | "overnight_rate" | "daytime_rate";
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string): Date {
  if (!ISO_DATE.test(s)) throw new Error(`Invalid date: ${s}`);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / 86_400_000);
}

function isWeekendUTC(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function countWeekendNights(checkIn: Date, nights: number): number {
  let n = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(checkIn.getTime() + i * 86_400_000);
    if (isWeekendUTC(d)) n += 1;
  }
  return n;
}

function applyWeekendSurcharge(
  perNight: number,
  weekendNights: number,
  pct: number,
): number {
  if (pct <= 0 || weekendNights <= 0) return 0;
  return Math.round((perNight * pct * weekendNights) / 100);
}

export function calculatePrice(plan: RatePlan, query: PriceQuery): PriceBreakdown {
  const checkIn = parseDate(query.check_in);
  const checkOut = parseDate(query.check_out);

  if (plan.booking_type === "hourly") {
    if (plan.hourly_rate === null) {
      throw new Error("Hourly rate plan missing hourly_rate");
    }
    const hours = Math.max(query.duration_hours ?? plan.min_hours, plan.min_hours);
    const baseHours = plan.min_hours;
    const extraHours = Math.max(0, hours - baseHours);
    const extraRate = plan.extra_hour_rate ?? plan.hourly_rate;
    const base = plan.hourly_rate * baseHours + extraRate * extraHours;
    return {
      base,
      surcharge: 0,
      total: base,
      details: {
        nights: 0,
        hours,
        weekend_nights: 0,
        applied_rate: "hourly_rate",
      },
    };
  }

  if (plan.booking_type === "daytime") {
    if (plan.daytime_rate === null) {
      throw new Error("Daytime rate plan missing daytime_rate");
    }
    const isWeekend = isWeekendUTC(checkIn);
    const surcharge = applyWeekendSurcharge(
      plan.daytime_rate,
      isWeekend ? 1 : 0,
      plan.weekend_surcharge_pct,
    );
    return {
      base: plan.daytime_rate,
      surcharge,
      total: plan.daytime_rate + surcharge,
      details: {
        nights: 0,
        hours: 0,
        weekend_nights: isWeekend ? 1 : 0,
        applied_rate: "daytime_rate",
      },
    };
  }

  if (plan.overnight_rate === null) {
    throw new Error("Overnight rate plan missing overnight_rate");
  }
  const nights = Math.max(1, daysBetween(checkIn, checkOut));
  const weekendNights = countWeekendNights(checkIn, nights);
  const base = plan.overnight_rate * nights;
  const surcharge = applyWeekendSurcharge(
    plan.overnight_rate,
    weekendNights,
    plan.weekend_surcharge_pct,
  );
  return {
    base,
    surcharge,
    total: base + surcharge,
    details: {
      nights,
      hours: 0,
      weekend_nights: weekendNights,
      applied_rate: "overnight_rate",
    },
  };
}

// ── Rate overrides (giá ngày lễ / sự kiện) ──────────
export interface RateOverride {
  date: string; // YYYY-MM-DD
  room_type_id: string | null;
  surcharge_pct: number;
  fixed_hourly: number | null;
  fixed_overnight: number | null;
  fixed_daytime: number | null;
  name?: string;
  is_active?: boolean;
}

export interface PriceBreakdownWithOverrides extends PriceBreakdown {
  override_surcharge: number;
  applied_overrides: string[];
}

function isoAddDays(iso: string, days: number): string {
  const d = new Date(parseDate(iso).getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function findOverride(
  overrides: ReadonlyArray<RateOverride>,
  date: string,
): RateOverride | undefined {
  return overrides.find((o) => o.is_active !== false && o.date === date);
}

/**
 * Price with per-date overrides. A fixed_* rate replaces the plan's base rate
 * for that date; surcharge_pct adds on top of the (possibly replaced) rate.
 * Weekend surcharge from the plan still applies for overnight/daytime.
 */
export function calculatePriceWithOverrides(
  plan: RatePlan,
  query: PriceQuery,
  overrides: ReadonlyArray<RateOverride>,
): PriceBreakdownWithOverrides {
  const applied: string[] = [];

  if (plan.booking_type === "hourly") {
    if (plan.hourly_rate === null) throw new Error("Hourly rate plan missing hourly_rate");
    const o = findOverride(overrides, query.check_in);
    const firstRate = o?.fixed_hourly ?? plan.hourly_rate;
    const hours = Math.max(query.duration_hours ?? plan.min_hours, plan.min_hours);
    const extraHours = Math.max(0, hours - plan.min_hours);
    const extraRate = plan.extra_hour_rate ?? plan.hourly_rate;
    const base = firstRate * plan.min_hours + extraRate * extraHours;
    const overrideSurcharge = o && o.surcharge_pct > 0 ? Math.round((base * o.surcharge_pct) / 100) : 0;
    if (o && (o.fixed_hourly !== null || o.surcharge_pct > 0) && o.name) applied.push(o.name);
    return {
      base,
      surcharge: overrideSurcharge,
      total: base + overrideSurcharge,
      override_surcharge: overrideSurcharge,
      applied_overrides: applied,
      details: { nights: 0, hours, weekend_nights: 0, applied_rate: "hourly_rate" },
    };
  }

  if (plan.booking_type === "daytime") {
    if (plan.daytime_rate === null) throw new Error("Daytime rate plan missing daytime_rate");
    const o = findOverride(overrides, query.check_in);
    const rate = o?.fixed_daytime ?? plan.daytime_rate;
    const isWeekend = isWeekendUTC(parseDate(query.check_in));
    const weekendSurcharge = applyWeekendSurcharge(rate, isWeekend ? 1 : 0, plan.weekend_surcharge_pct);
    const overrideSurcharge = o && o.surcharge_pct > 0 ? Math.round((rate * o.surcharge_pct) / 100) : 0;
    if (o && (o.fixed_daytime !== null || o.surcharge_pct > 0) && o.name) applied.push(o.name);
    return {
      base: rate,
      surcharge: weekendSurcharge + overrideSurcharge,
      total: rate + weekendSurcharge + overrideSurcharge,
      override_surcharge: overrideSurcharge,
      applied_overrides: applied,
      details: {
        nights: 0,
        hours: 0,
        weekend_nights: isWeekend ? 1 : 0,
        applied_rate: "daytime_rate",
      },
    };
  }

  if (plan.overnight_rate === null) throw new Error("Overnight rate plan missing overnight_rate");
  const checkIn = parseDate(query.check_in);
  const checkOut = parseDate(query.check_out);
  const nights = Math.max(1, daysBetween(checkIn, checkOut));

  let base = 0;
  let weekendSurcharge = 0;
  let overrideSurcharge = 0;
  let weekendNights = 0;
  for (let i = 0; i < nights; i++) {
    const nightDate = isoAddDays(query.check_in, i);
    const o = findOverride(overrides, nightDate);
    const rate = o?.fixed_overnight ?? plan.overnight_rate;
    base += rate;
    if (isWeekendUTC(parseDate(nightDate))) {
      weekendNights += 1;
      weekendSurcharge += applyWeekendSurcharge(rate, 1, plan.weekend_surcharge_pct);
    }
    if (o && o.surcharge_pct > 0) {
      overrideSurcharge += Math.round((rate * o.surcharge_pct) / 100);
    }
    if (o && (o.fixed_overnight !== null || o.surcharge_pct > 0) && o.name && !applied.includes(o.name)) {
      applied.push(o.name);
    }
  }

  return {
    base,
    surcharge: weekendSurcharge + overrideSurcharge,
    total: base + weekendSurcharge + overrideSurcharge,
    override_surcharge: overrideSurcharge,
    applied_overrides: applied,
    details: { nights, hours: 0, weekend_nights: weekendNights, applied_rate: "overnight_rate" },
  };
}

export function pickActiveRatePlan<P extends RatePlan & {
  is_active?: boolean;
  priority?: number;
  valid_from?: string;
  valid_to?: string | null;
}>(plans: P[], on: string): P | null {
  const target = on;
  const candidates = plans.filter((p) => {
    if (p.is_active === false) return false;
    if (p.valid_from && p.valid_from > target) return false;
    if (p.valid_to && p.valid_to < target) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return candidates[0] ?? null;
}
