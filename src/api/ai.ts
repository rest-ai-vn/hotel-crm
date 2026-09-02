// API dành cho trợ lý AI (chatbot Zalo/Facebook, tổng đài AI): tra phòng trống,
// báo giá, đặt phòng, tra cứu và hủy. Xác thực bằng API key của từng cơ sở.
//
// Nguyên tắc: AI chỉ gửi Ý ĐỊNH. Giá, tồn phòng và mọi ràng buộc đều tính lại ở
// máy chủ — không bao giờ tin số tiền do mô hình sinh ra.
import { Hono } from "hono";
import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerDb } from "../db/supabase-client";
import { getTenantDb } from "../db/tenant-db";
import { requireApiKey, type ApiKeyContext } from "../middleware/api-key";
import { parseBody } from "../lib/validate";
import { aiBookSchema, aiCancelSchema } from "../lib/schemas";
import {
  addDaysIso,
  daysBetweenIso,
  isIsoDate,
  loadAvailability,
  type RoomTypeAvailability,
} from "../lib/availability";
import { buildVietQrUrl } from "../lib/billing";
import { openApiDocument, toolDefinitions } from "./ai-schema";
import type { BookingType } from "../lib/pricing";

const ai = new Hono();

const MAX_CALENDAR_DAYS = 62;
const BOOKING_TYPES: BookingType[] = ["overnight", "hourly", "daytime"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lỗi có `code` ổn định để AI phân nhánh mà không phải đọc tiếng Việt. */
function fail(
  c: Context,
  status: 400 | 403 | 404 | 409,
  error: string,
  code: string,
  extra?: Record<string, unknown>,
) {
  return c.json({ success: false, error, code, ...(extra ?? {}) }, status);
}

/** Cấu hình cơ sở — dùng service client vì RLS chặn `properties` theo tenant claim. */
async function loadProperty(propertyId: string) {
  const { data } = await getServerDb()
    .from("properties")
    .select(
      "id, name, code, address, phone, vat_rate, deposit_pct, bank_id, bank_account_no, bank_account_name",
    )
    .eq("id", propertyId)
    .maybeSingle();
  return data;
}

// ── Khám phá hợp đồng API (công khai, không chứa dữ liệu tenant) ──
ai.get("/openapi.json", (c) => {
  const url = new URL(c.req.url);
  return c.json(openApiDocument(`${url.protocol}//${url.host}`));
});

ai.get("/tools.json", (c) =>
  c.json({
    success: true,
    data: {
      auth: { type: "api_key", header: "X-API-Key" },
      base_url: `${new URL(c.req.url).origin}/api/ai`,
      tools: toolDefinitions(),
    },
  }),
);

// ── Thông tin khách sạn ──
ai.get("/hotel", requireApiKey("read"), async (c) => {
  const { property_id } = c.get("apiKey");
  const property = await loadProperty(property_id);
  if (!property) return fail(c, 404, "Không tìm thấy cơ sở", "property_not_found");

  const db = await getTenantDb(property_id);
  const [typesRes, servicesRes] = await Promise.all([
    db
      .from("room_types")
      .select("id, code, name, description, max_guests, amenities, photos")
      .eq("property_id", property_id)
      .eq("is_active", true)
      .order("sort_order"),
    db
      .from("services")
      .select("name, category, price, unit")
      .eq("property_id", property_id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return c.json({
    success: true,
    data: {
      name: property.name,
      address: property.address,
      phone: property.phone,
      vat_rate: property.vat_rate ?? 0,
      deposit_pct: property.deposit_pct ?? 0,
      currency: "VND",
      today: todayIso(),
      room_types: typesRes.data ?? [],
      services: servicesRes.data ?? [],
    },
  });
});

// ── Phòng trống + báo giá ──
ai.get("/availability", requireApiKey("read"), async (c) => {
  const { property_id } = c.get("apiKey");
  const checkIn = c.req.query("check_in") ?? "";
  const checkOut = c.req.query("check_out") || checkIn;
  const bookingType = (c.req.query("booking_type") ?? "overnight") as BookingType;

  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return fail(c, 400, "check_in và check_out phải dạng YYYY-MM-DD", "invalid_date");
  }
  if (checkOut < checkIn) {
    return fail(c, 400, "check_out phải bằng hoặc sau check_in", "invalid_range");
  }
  if (!BOOKING_TYPES.includes(bookingType)) {
    return fail(
      c,
      400,
      "booking_type phải là overnight, hourly hoặc daytime",
      "invalid_booking_type",
    );
  }
  if (bookingType === "overnight" && checkOut === checkIn) {
    return fail(c, 400, "Đặt qua đêm cần check_out sau check_in", "invalid_range");
  }

  const property = await loadProperty(property_id);
  if (!property) return fail(c, 404, "Không tìm thấy cơ sở", "property_not_found");
  const db = await getTenantDb(property_id);

  const roomTypeId = await resolveRoomTypeId(db, property_id, {
    room_type_id: c.req.query("room_type_id"),
    room_type_code: c.req.query("room_type_code"),
  });
  if (roomTypeId === null) {
    return fail(c, 404, "Không tìm thấy loại phòng", "room_type_not_found");
  }

  const adults = Number(c.req.query("adults") ?? 0);
  const durationHours = Number(c.req.query("duration_hours") ?? 0);
  const roomTypes = await loadAvailability(db, property_id, property.vat_rate ?? 0, {
    check_in: checkIn,
    check_out: checkOut,
    booking_type: bookingType,
    duration_hours: durationHours > 0 ? durationHours : undefined,
    room_type_id: roomTypeId ?? undefined,
    adults: adults > 0 ? adults : undefined,
  });

  return c.json({
    success: true,
    data: {
      check_in: checkIn,
      check_out: checkOut,
      booking_type: bookingType,
      nights: Math.max(daysBetweenIso(checkIn, checkOut), 0),
      any_available: roomTypes.some((t) => t.available_rooms > 0),
      room_types: roomTypes,
    },
  });
});

// ── Lịch phòng trống theo ngày ──
ai.get("/calendar", requireApiKey("read"), async (c) => {
  const { property_id } = c.get("apiKey");
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return fail(c, 400, "from và to phải dạng YYYY-MM-DD", "invalid_date");
  }
  const span = daysBetweenIso(from, to);
  if (span < 0) return fail(c, 400, "to phải sau from", "invalid_range");
  if (span > MAX_CALENDAR_DAYS) {
    return fail(c, 400, `Khoảng tối đa ${MAX_CALENDAR_DAYS} ngày`, "range_too_wide");
  }

  const property = await loadProperty(property_id);
  if (!property) return fail(c, 404, "Không tìm thấy cơ sở", "property_not_found");
  const db = await getTenantDb(property_id);

  const roomTypeId = await resolveRoomTypeId(db, property_id, {
    room_type_code: c.req.query("room_type_code"),
  });
  if (roomTypeId === null) {
    return fail(c, 404, "Không tìm thấy loại phòng", "room_type_not_found");
  }

  const perDay = await Promise.all(
    Array.from({ length: span + 1 }, (_, i) => addDaysIso(from, i)).map(async (date) => {
      const types = await loadAvailability(db, property_id, property.vat_rate ?? 0, {
        check_in: date,
        check_out: addDaysIso(date, 1),
        booking_type: "overnight",
        room_type_id: roomTypeId ?? undefined,
      });
      return {
        date,
        total_rooms: types.reduce((s, t) => s + t.total_rooms, 0),
        available_rooms: types.reduce((s, t) => s + t.available_rooms, 0),
        by_room_type: types.map((t) => ({
          code: t.code,
          name: t.name,
          available_rooms: t.available_rooms,
          total_amount: t.price?.total_amount ?? null,
        })),
      };
    }),
  );

  return c.json({ success: true, data: { from, to, days: perDay } });
});

// ── Đặt phòng ──
ai.post("/bookings", requireApiKey("book"), async (c) => {
  const parsed = await parseBody(c, aiBookSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const apiKey = c.get("apiKey");
  const propertyId = apiKey.property_id;

  if (input.check_in < todayIso()) {
    return fail(c, 400, "Ngày nhận phòng phải từ hôm nay trở đi", "check_in_in_past");
  }

  const db = await getTenantDb(propertyId);

  // Gọi lại cùng idempotency_key → trả nguyên kết quả cũ, không đặt trùng.
  if (input.idempotency_key) {
    const { data: prior } = await db
      .from("api_idempotency")
      .select("response")
      .eq("property_id", propertyId)
      .eq("key", input.idempotency_key)
      .maybeSingle();
    if (prior?.response) {
      return c.json({ success: true, data: { ...prior.response, replayed: true } });
    }
  }

  const property = await loadProperty(propertyId);
  if (!property) return fail(c, 404, "Không tìm thấy cơ sở", "property_not_found");

  const roomTypeId = await resolveRoomTypeId(db, propertyId, input);
  if (!roomTypeId) return fail(c, 404, "Không tìm thấy loại phòng", "room_type_not_found");

  const offers = await loadAvailability(db, propertyId, property.vat_rate ?? 0, {
    check_in: input.check_in,
    check_out: input.check_out,
    booking_type: input.booking_type,
    duration_hours: input.duration_hours,
  });
  const offer = offers.find((o) => o.room_type_id === roomTypeId);

  if (!offer) {
    return fail(c, 409, "Loại phòng này hiện không nhận đặt", "room_type_unavailable", {
      alternatives: alternativesOf(offers, input.rooms_count),
    });
  }
  if (offer.max_guests < input.adults) {
    return fail(
      c,
      409,
      `Phòng ${offer.name} tối đa ${offer.max_guests} khách (yêu cầu ${input.adults})`,
      "capacity_exceeded",
      { alternatives: alternativesOf(offers, input.rooms_count, input.adults) },
    );
  }
  if (!offer.price) {
    return fail(c, 409, offer.price_note ?? "Loại phòng này chưa có giá", "no_rate_plan", {
      alternatives: alternativesOf(offers, input.rooms_count, input.adults),
    });
  }
  if (offer.available_rooms < input.rooms_count) {
    return fail(
      c,
      409,
      `Chỉ còn ${offer.available_rooms} phòng ${offer.name} trong khoảng ngày này (cần ${input.rooms_count})`,
      "sold_out",
      {
        available_rooms: offer.available_rooms,
        alternatives: alternativesOf(offers, input.rooms_count, input.adults),
      },
    );
  }

  const guest = await findOrCreateGuest(db, propertyId, input);
  if (!guest.ok) return fail(c, 400, guest.error, "guest_failed");

  // Gán ra biến để TypeScript giữ được thu hẹp kiểu bên trong closure bên dưới.
  const price = offer.price;

  const groupCode =
    input.rooms_count > 1 ? `GRP-${Date.now().toString(36).toUpperCase().slice(-6)}` : null;
  const rows = Array.from({ length: input.rooms_count }, () => ({
    guest_id: guest.id,
    room_type_id: roomTypeId,
    property_id: propertyId,
    booking_type: input.booking_type,
    source: input.source,
    check_in: input.check_in,
    check_out: input.check_out,
    check_in_time: input.check_in_time ?? null,
    duration_hours: input.duration_hours ?? null,
    adults: input.adults,
    children: input.children,
    base_amount: price.base_amount,
    surcharge: price.surcharge,
    tax_amount: price.tax_amount,
    total_amount: price.total_amount,
    notes: input.note ? `[AI] ${input.note}` : "[AI] Đặt qua trợ lý AI",
    internal_notes: `Tạo bởi API key "${apiKey.name}"`,
    group_code: groupCode,
  }));

  const { data: created, error } = await db.from("reservations").insert(rows).select();
  if (error) return fail(c, 409, error.message, "booking_failed");

  const first = created?.[0];
  const grandTotal = price.total_amount * input.rooms_count;
  const response = {
    confirmation_code: first?.confirmation_code ?? null,
    group_code: groupCode,
    status: first?.status ?? "confirmed",
    check_in: input.check_in,
    check_out: input.check_out,
    booking_type: input.booking_type,
    rooms_count: input.rooms_count,
    room_type: { id: offer.room_type_id, code: offer.code, name: offer.name },
    guest: { name: input.guest_name, phone: input.guest_phone },
    price: { ...price, per_room_amount: price.total_amount, total_amount: grandTotal },
    deposit: buildDeposit(property, grandTotal, first?.confirmation_code ?? ""),
    replayed: false,
  };

  if (input.idempotency_key) {
    await db.from("api_idempotency").insert({
      property_id: propertyId,
      key: input.idempotency_key,
      endpoint: "POST /api/ai/bookings",
      response,
    });
  }

  await logApiAudit(db, apiKey, "ai.booking.create", first?.id ?? null, {
    confirmation_code: response.confirmation_code,
    rooms_count: input.rooms_count,
    total_amount: grandTotal,
    source: input.source,
  });

  return c.json({ success: true, data: response }, 201);
});

// ── Tra cứu đặt phòng ──
ai.get("/bookings/:code", requireApiKey("read"), async (c) => {
  const { property_id } = c.get("apiKey");
  const code = (c.req.param("code") ?? "").trim().toUpperCase();
  const db = await getTenantDb(property_id);

  const { data } = await db
    .from("reservations")
    .select(
      "confirmation_code, status, booking_type, check_in, check_out, adults, children, base_amount, surcharge, tax_amount, total_amount, payment_status, notes, group_code, guests(name, phone), room_types(code, name), rooms(number)",
    )
    .eq("property_id", property_id)
    .eq("confirmation_code", code)
    .maybeSingle();

  if (!data) return fail(c, 404, "Không tìm thấy mã đặt phòng", "booking_not_found");
  return c.json({ success: true, data });
});

// ── Hủy đặt phòng ──
ai.post("/bookings/:code/cancel", requireApiKey("book"), async (c) => {
  const parsed = await parseBody(c, aiCancelSchema);
  if (!parsed.ok) return parsed.response;

  const apiKey = c.get("apiKey");
  const code = (c.req.param("code") ?? "").trim().toUpperCase();
  const db = await getTenantDb(apiKey.property_id);

  const { data: booking } = await db
    .from("reservations")
    .select("id, status, guests(phone)")
    .eq("property_id", apiKey.property_id)
    .eq("confirmation_code", code)
    .maybeSingle();

  if (!booking) return fail(c, 404, "Không tìm thấy mã đặt phòng", "booking_not_found");

  // Xác minh đúng khách: số điện thoại phải khớp hồ sơ.
  const guestPhone = (booking.guests as { phone?: string | null } | null)?.phone ?? "";
  const onFile = normalizePhone(guestPhone);
  if (!onFile || onFile !== normalizePhone(parsed.data.guest_phone)) {
    return fail(c, 400, "Số điện thoại không khớp với đặt phòng này", "phone_mismatch");
  }
  if (booking.status !== "confirmed") {
    return fail(
      c,
      409,
      `Không thể hủy đặt phòng ở trạng thái ${booking.status}`,
      "not_cancellable",
    );
  }

  const { data, error } = await db
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: parsed.data.reason ?? "Khách hủy qua trợ lý AI",
    })
    .eq("id", booking.id)
    .select("confirmation_code, status, cancelled_at, cancel_reason")
    .single();

  if (error) return fail(c, 400, error.message, "cancel_failed");

  await logApiAudit(db, apiKey, "ai.booking.cancel", booking.id, {
    confirmation_code: code,
    reason: parsed.data.reason ?? null,
  });
  return c.json({ success: true, data });
});

// ── Helpers ──

/** `undefined` = không lọc, id = tìm thấy, `null` = mã/id không tồn tại. */
async function resolveRoomTypeId(
  db: SupabaseClient,
  propertyId: string,
  input: { room_type_id?: string; room_type_code?: string },
): Promise<string | undefined | null> {
  if (input.room_type_id) {
    const { data } = await db
      .from("room_types")
      .select("id")
      .eq("property_id", propertyId)
      .eq("id", input.room_type_id)
      .maybeSingle();
    return data?.id ?? null;
  }
  if (input.room_type_code) {
    const { data } = await db
      .from("room_types")
      .select("id")
      .eq("property_id", propertyId)
      .eq("code", input.room_type_code.trim().toUpperCase())
      .maybeSingle();
    return data?.id ?? null;
  }
  return undefined;
}

/** Gợi ý loại phòng khác còn trống — để AI đề xuất thay vì chỉ báo "hết phòng". */
function alternativesOf(offers: RoomTypeAvailability[], needed: number, adults = 0) {
  return offers
    .filter(
      (o) => o.available_rooms >= needed && o.price !== null && (adults <= 0 || o.max_guests >= adults),
    )
    .map((o) => ({
      room_type_code: o.code,
      name: o.name,
      max_guests: o.max_guests,
      available_rooms: o.available_rooms,
      total_amount: o.price?.total_amount ?? null,
    }));
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").replace(/^84/, "0");
}

async function findOrCreateGuest(
  db: SupabaseClient,
  propertyId: string,
  input: {
    guest_name: string;
    guest_phone: string;
    guest_email?: string;
    zalo_id?: string;
    facebook_id?: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: existing } = await db
    .from("guests")
    .select("id, zalo_id, facebook_id")
    .eq("property_id", propertyId)
    .eq("phone", input.guest_phone)
    .maybeSingle();

  if (existing) {
    // Bổ sung kênh chat nếu hồ sơ cũ chưa có — lần sau nhận ra khách ngay.
    const patch: Record<string, string> = {};
    if (input.zalo_id && !existing.zalo_id) patch.zalo_id = input.zalo_id;
    if (input.facebook_id && !existing.facebook_id) patch.facebook_id = input.facebook_id;
    if (Object.keys(patch).length > 0) {
      await db.from("guests").update(patch).eq("id", existing.id);
    }
    return { ok: true, id: existing.id };
  }

  const { data, error } = await db
    .from("guests")
    .insert({
      property_id: propertyId,
      name: input.guest_name,
      phone: input.guest_phone,
      email: input.guest_email ?? null,
      zalo_id: input.zalo_id ?? null,
      facebook_id: input.facebook_id ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

function buildDeposit(
  property: {
    deposit_pct: number | null;
    bank_id: string | null;
    bank_account_no: string | null;
    bank_account_name: string | null;
  },
  total: number,
  memo: string,
) {
  const pct = property.deposit_pct ?? 0;
  if (pct <= 0 || !property.bank_id || !property.bank_account_no) return null;
  const amount = Math.round((total * pct) / 100);
  return {
    pct,
    amount,
    bank_id: property.bank_id,
    bank_account_no: property.bank_account_no,
    bank_account_name: property.bank_account_name ?? "",
    qr_url: buildVietQrUrl({
      bankId: property.bank_id,
      accountNo: property.bank_account_no,
      accountName: property.bank_account_name ?? "",
      amount,
      memo,
    }),
  };
}

/** Nhật ký cho hành động do API key thực hiện (không gắn nhân viên nào). */
async function logApiAudit(
  db: SupabaseClient,
  apiKey: ApiKeyContext,
  action: string,
  entityId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await db.from("audit_logs").insert({
      staff_id: null,
      staff_name: `API: ${apiKey.name}`,
      property_id: apiKey.property_id,
      action,
      entity: "reservation",
      entity_id: entityId,
      details: { ...details, api_key_id: apiKey.id },
    });
  } catch {
    /* nhật ký không được phép làm hỏng nghiệp vụ chính */
  }
}

export default ai;
