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

export type GuestCreate = z.infer<typeof guestCreateSchema>;
export type ReservationCreate = z.infer<typeof reservationCreateSchema>;
