// Public booking engine — NO auth. Everything is scoped by property `code`,
// prices are recomputed server-side, and booking is rate-limited + honeypotted.
import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { publicBookSchema } from "../lib/schemas";
import {
  calculatePriceWithOverrides,
  pickActiveRatePlan,
  type RateOverride,
} from "../lib/pricing";
import { computeVat } from "../lib/billing";
import { createRateLimiter } from "../lib/rate-limit";

const publicApi = new Hono();

// 20 booking attempts / 15 minutes per IP.
const bookLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function findProperty(code: string) {
  const db = getServerDb();
  const { data } = await db
    .from("properties")
    .select("id, name, code, address, phone, vat_rate")
    .eq("code", code.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

/** Server-side price + availability for one room type and date range. */
async function computeOffer(
  propertyId: string,
  vatRate: number,
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
) {
  const db = getServerDb();
  const [plansRes, overridesRes, totalRes, bookedRes] = await Promise.all([
    db
      .from("rate_plans")
      .select("*")
      .eq("property_id", propertyId)
      .eq("room_type_id", roomTypeId)
      .eq("booking_type", "overnight")
      .eq("is_active", true),
    db
      .from("rate_overrides")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .gte("date", checkIn)
      .lte("date", checkOut)
      .or(`room_type_id.is.null,room_type_id.eq.${roomTypeId}`),
    db
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("room_type_id", roomTypeId)
      .eq("is_active", true),
    db
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("room_type_id", roomTypeId)
      .in("status", ["confirmed", "checked_in"])
      .lte("check_in", checkOut)
      .gte("check_out", checkIn),
  ]);

  const plan = pickActiveRatePlan(plansRes.data ?? [], checkIn);
  if (!plan) return null;

  const breakdown = calculatePriceWithOverrides(
    plan,
    { check_in: checkIn, check_out: checkOut },
    (overridesRes.data ?? []) as RateOverride[],
  );
  const tax = computeVat(breakdown.total, vatRate);
  return {
    base: breakdown.base,
    surcharge: breakdown.surcharge,
    tax_amount: tax,
    total: breakdown.total + tax,
    available: Math.max(0, (totalRes.count ?? 0) - (bookedRes.count ?? 0)),
  };
}

publicApi.get("/hotel", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ success: false, error: "code required" }, 400);
  const property = await findProperty(code);
  if (!property) return c.json({ success: false, error: "Không tìm thấy khách sạn" }, 404);

  const db = getServerDb();
  const { data: types } = await db
    .from("room_types")
    .select("id, name, code, max_guests, description")
    .eq("property_id", property.id)
    .eq("is_active", true)
    .order("sort_order");

  return c.json({
    success: true,
    data: {
      name: property.name,
      address: property.address,
      phone: property.phone,
      room_types: types ?? [],
    },
  });
});

publicApi.get("/quote", async (c) => {
  const code = c.req.query("code");
  const roomTypeId = c.req.query("room_type_id");
  const checkIn = c.req.query("check_in");
  const checkOut = c.req.query("check_out");
  if (!code || !roomTypeId || !checkIn || !checkOut) {
    return c.json({ success: false, error: "Thiếu tham số" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return c.json({ success: false, error: "Ngày không hợp lệ" }, 400);
  }
  if (checkIn < todayIso() || checkOut <= checkIn) {
    return c.json({ success: false, error: "Khoảng ngày không hợp lệ" }, 400);
  }

  const property = await findProperty(code);
  if (!property) return c.json({ success: false, error: "Không tìm thấy khách sạn" }, 404);

  const offer = await computeOffer(
    property.id,
    property.vat_rate ?? 0,
    roomTypeId,
    checkIn,
    checkOut,
  );
  if (!offer) return c.json({ success: false, error: "Loại phòng này chưa có giá" }, 404);
  return c.json({ success: true, data: offer });
});

publicApi.post("/book", async (c) => {
  const parsed = await parseBody(c, publicBookSchema);
  if (!parsed.ok) return parsed.response;
  const { code, room_type_id, check_in, check_out, name, phone, note, website } = parsed.data;

  // Honeypot filled → almost certainly a bot. Pretend success, store nothing.
  if (website) {
    return c.json({ success: true, data: { confirmation_code: "BON-000000-BOT" } }, 201);
  }

  const ip = clientIp(c);
  if (!bookLimiter.isAllowed(ip)) {
    return c.json({ success: false, error: "Quá nhiều yêu cầu, thử lại sau ít phút" }, 429);
  }
  bookLimiter.hit(ip);

  if (check_in < todayIso()) {
    return c.json({ success: false, error: "Ngày nhận phòng phải từ hôm nay" }, 400);
  }

  const property = await findProperty(code);
  if (!property) return c.json({ success: false, error: "Không tìm thấy khách sạn" }, 404);

  const offer = await computeOffer(
    property.id,
    property.vat_rate ?? 0,
    room_type_id,
    check_in,
    check_out,
  );
  if (!offer) return c.json({ success: false, error: "Loại phòng này chưa có giá" }, 404);
  if (offer.available <= 0) {
    return c.json({ success: false, error: "Hết phòng loại này trong khoảng ngày đã chọn" }, 409);
  }

  const db = getServerDb();
  // Find-or-create guest by phone within this property.
  let guestId: string;
  const { data: existingGuest } = await db
    .from("guests")
    .select("id")
    .eq("property_id", property.id)
    .eq("phone", phone)
    .maybeSingle();
  if (existingGuest) {
    guestId = existingGuest.id;
  } else {
    const { data: guest, error: guestErr } = await db
      .from("guests")
      .insert({ name, phone, property_id: property.id })
      .select("id")
      .single();
    if (guestErr) return c.json({ success: false, error: guestErr.message }, 400);
    guestId = guest.id;
  }

  const { data, error } = await db
    .from("reservations")
    .insert({
      guest_id: guestId,
      room_type_id,
      booking_type: "overnight",
      source: "website",
      check_in,
      check_out,
      base_amount: offer.base,
      surcharge: offer.surcharge,
      tax_amount: offer.tax_amount,
      total_amount: offer.total,
      notes: note ? `[Đặt online] ${note}` : "[Đặt online]",
      property_id: property.id,
    })
    .select("confirmation_code, check_in, check_out, total_amount")
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  return c.json({ success: true, data }, 201);
});

export default publicApi;
