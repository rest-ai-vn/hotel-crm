import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const time24 = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM");
const phone = z.string().regex(/^\+?\d[\d\s-]{6,19}$/, "Invalid phone");
const nonEmpty = z.string().min(1).max(500);
const intMoney = z.number().int().min(0).max(2_000_000_000);

export const roomTypeCreateSchema = z.object({
  name: nonEmpty,
  code: z.string().min(1).max(50),
  description: z.string().max(2000).optional(),
  max_guests: z.number().int().min(1).max(20).default(2),
  amenities: z.array(z.string().max(100)).max(50).optional(),
  photos: z.array(z.string().url()).max(20).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export const roomTypeUpdateSchema = roomTypeCreateSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const roomCreateSchema = z.object({
  room_type_id: uuid,
  number: z.string().min(1).max(20),
  floor: z.number().int().min(0).max(200),
  notes: z.string().max(1000).optional(),
});
export const roomStatusSchema = z.object({
  status: z.enum([
    "available",
    "reserved",
    "occupied",
    "cleaning",
    "maintenance",
    "out_of_order",
  ]),
});

export const guestCreateSchema = z.object({
  name: nonEmpty,
  phone: phone.optional(),
  email: z.string().email().optional(),
  id_number: z.string().max(50).optional(),
  id_type: z.string().max(50).optional(),
  nationality: z.string().max(10).optional(),
  address: z.string().max(500).optional(),
  zalo_id: z.string().max(100).optional(),
  facebook_id: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});
export const guestUpdateSchema = guestCreateSchema.partial().extend({
  is_blacklisted: z.boolean().optional(),
  loyalty_tier: z.string().max(50).optional(),
});
export const guestFindOrCreateSchema = z
  .object({
    phone: phone.optional(),
    zalo_id: z.string().max(100).optional(),
    facebook_id: z.string().max(100).optional(),
    name: z.string().max(200).optional(),
  })
  .refine((d) => d.phone || d.zalo_id || d.facebook_id, {
    message: "At least one of phone, zalo_id, facebook_id required",
  });

export const reservationCreateSchema = z
  .object({
    guest_id: uuid,
    room_type_id: uuid,
    room_id: uuid.optional(),
    booking_type: z.enum(["hourly", "overnight", "daytime"]),
    source: z
      .enum([
        "walk_in",
        "zalo",
        "facebook",
        "phone",
        "ota_agoda",
        "ota_booking",
        "ota_traveloka",
        "website",
      ])
      .optional(),
    check_in: isoDate,
    check_in_time: time24.optional(),
    check_out: isoDate,
    check_out_time: time24.optional(),
    duration_hours: z.number().int().min(1).max(720).optional(),
    adults: z.number().int().min(1).max(20).default(1),
    children: z.number().int().min(0).max(20).default(0),
    base_amount: intMoney,
    surcharge: intMoney.optional(),
    discount_amount: intMoney.optional(),
    tax_amount: intMoney.optional(),
    total_amount: intMoney,
    notes: z.string().max(2000).optional(),
    internal_notes: z.string().max(2000).optional(),
  })
  .refine((d) => d.check_out >= d.check_in, {
    message: "check_out must be on or after check_in",
    path: ["check_out"],
  });
export const reservationUpdateSchema = z
  .object({
    room_id: uuid.optional(),
    check_in: isoDate.optional(),
    check_in_time: time24.optional(),
    check_out: isoDate.optional(),
    check_out_time: time24.optional(),
    adults: z.number().int().min(1).max(20).optional(),
    children: z.number().int().min(0).max(20).optional(),
    base_amount: intMoney.optional(),
    surcharge: intMoney.optional(),
    discount_amount: intMoney.optional(),
    tax_amount: intMoney.optional(),
    total_amount: intMoney.optional(),
    payment_status: z.enum(["pending", "partial", "paid", "refunded"]).optional(),
    notes: z.string().max(2000).optional(),
    internal_notes: z.string().max(2000).optional(),
  })
  .refine(
    (d) => !d.check_in || !d.check_out || d.check_out >= d.check_in,
    { message: "check_out must be on or after check_in", path: ["check_out"] },
  );
export const reservationCancelSchema = z.object({
  reason: z.string().max(500).optional(),
});
export const reservationCheckInSchema = z.object({
  room_id: uuid,
});

export const ratePlanCreateSchema = z
  .object({
    room_type_id: uuid,
    booking_type: z.enum(["hourly", "overnight", "daytime"]),
    name: nonEmpty,
    hourly_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
    overnight_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
    daytime_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
    min_hours: z.number().int().min(1).max(24).default(1),
    extra_hour_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
    weekend_surcharge_pct: z.number().int().min(0).max(100).default(0),
    valid_from: isoDate.optional(),
    valid_to: isoDate.nullable().optional(),
    priority: z.number().int().min(0).max(10_000).default(100),
    is_active: z.boolean().default(true),
  })
  .refine(
    (d) =>
      (d.booking_type === "hourly" && (d.hourly_rate ?? 0) > 0) ||
      (d.booking_type === "overnight" && (d.overnight_rate ?? 0) > 0) ||
      (d.booking_type === "daytime" && (d.daytime_rate ?? 0) > 0),
    { message: "Phải nhập giá tương ứng với loại đặt", path: ["booking_type"] },
  );

export const ratePlanUpdateSchema = z.object({
  name: nonEmpty.optional(),
  hourly_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
  overnight_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
  daytime_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
  min_hours: z.number().int().min(1).max(24).optional(),
  extra_hour_rate: z.number().int().min(0).max(100_000_000).nullable().optional(),
  weekend_surcharge_pct: z.number().int().min(0).max(100).optional(),
  valid_from: isoDate.optional(),
  valid_to: isoDate.nullable().optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  is_active: z.boolean().optional(),
});

export const paymentCreateSchema = z.object({
  reservation_id: uuid,
  amount: z.number().int().min(1).max(2_000_000_000),
  method: z.enum(["cash", "card", "transfer", "vietqr"]).default("cash"),
  kind: z.enum(["payment", "deposit", "refund"]).default("payment"),
  note: z.string().max(500).optional(),
});

// ── Shifts (giao ca) ──
export const shiftOpenSchema = z.object({
  opening_cash: intMoney.default(0),
  note: z.string().max(1000).optional(),
});
export const shiftCloseSchema = z.object({
  counted_cash: intMoney,
  note: z.string().max(1000).optional(),
});

// ── Night audit (chốt ngày) ──
export const nightAuditRunSchema = z.object({
  business_date: isoDate.optional(),
  note: z.string().max(1000).optional(),
});

// ── Rate overrides (giá ngày lễ) ──
export const rateOverrideCreateSchema = z
  .object({
    name: nonEmpty,
    date: isoDate,
    room_type_id: uuid.nullable().optional(),
    surcharge_pct: z.number().int().min(0).max(200).default(0),
    fixed_hourly: z.number().int().min(0).max(100_000_000).nullable().optional(),
    fixed_overnight: z.number().int().min(0).max(100_000_000).nullable().optional(),
    fixed_daytime: z.number().int().min(0).max(100_000_000).nullable().optional(),
    is_active: z.boolean().default(true),
  })
  .refine(
    (d) =>
      d.surcharge_pct > 0 ||
      d.fixed_hourly != null ||
      d.fixed_overnight != null ||
      d.fixed_daytime != null,
    { message: "Cần nhập phụ thu % hoặc ít nhất một giá cố định", path: ["surcharge_pct"] },
  );
export const rateOverrideUpdateSchema = z.object({
  name: nonEmpty.optional(),
  date: isoDate.optional(),
  room_type_id: uuid.nullable().optional(),
  surcharge_pct: z.number().int().min(0).max(200).optional(),
  fixed_hourly: z.number().int().min(0).max(100_000_000).nullable().optional(),
  fixed_overnight: z.number().int().min(0).max(100_000_000).nullable().optional(),
  fixed_daytime: z.number().int().min(0).max(100_000_000).nullable().optional(),
  is_active: z.boolean().optional(),
});

// ── Reservation ops: move room / extend / no-show ──
export const reservationMoveRoomSchema = z.object({
  room_id: uuid,
  reason: z.string().max(500).optional(),
});
export const reservationExtendSchema = z.object({
  check_out: isoDate,
  check_out_time: time24.optional(),
  extra_amount: intMoney.default(0),
  note: z.string().max(500).optional(),
});
export const reservationNoShowSchema = z.object({
  note: z.string().max(500).optional(),
});

// ── POS / Additional services ──
export const serviceCreateSchema = z.object({
  name: nonEmpty,
  category: z.string().min(1).max(50).default("other"),
  price: intMoney,
  unit: z.string().min(1).max(50).default("lần"),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export const serviceUpdateSchema = serviceCreateSchema.partial().extend({
  is_active: z.boolean().optional(),
});
export const serviceChargeSchema = z.object({
  reservation_id: uuid,
  service_id: uuid.optional(),
  name: nonEmpty,
  unit_price: intMoney,
  quantity: z.number().int().min(1).max(1000).default(1),
  note: z.string().max(500).optional(),
});

// ── Cash book ──
export const cashTxnCreateSchema = z.object({
  direction: z.enum(["income", "expense"]),
  category: z.string().min(1).max(50).default("other"),
  amount: z.number().int().min(1).max(2_000_000_000),
  note: z.string().max(500).optional(),
  occurred_on: isoDate.optional(),
  reservation_id: uuid.optional(),
});

export type GuestCreate = z.infer<typeof guestCreateSchema>;
export type ReservationCreate = z.infer<typeof reservationCreateSchema>;
