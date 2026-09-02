// Tồn phòng + báo giá dùng chung cho API AI.
//
// Quy ước chồng lấn: nửa mở [check_in, check_out) — đúng bằng ràng buộc
// `no_double_book_overnight` ở DB (migration 011), nên khách trả phòng ngày 5
// thì phòng đó ngày 5 lại trống. Đặt theo giờ / theo ngày (check_out == check_in)
// được quy về đúng một ngày [check_in, check_in+1).
//
// Mọi truy vấn DB gom vào loadInventory(): đúng 5 query cho một khoảng ngày, dù
// khoảng đó dài 1 hay 62 ngày, dù cơ sở có bao nhiêu loại phòng.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculatePriceWithOverrides,
  pickActiveRatePlan,
  type BookingType,
  type RatePlan,
  type RateOverride,
} from "./pricing";
import { computeVat } from "./billing";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_STATUSES = ["confirmed", "checked_in"];

export interface StayRange {
  check_in: string;
  check_out: string;
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y!, m! - 1, d!);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000);
}

/** Ngày kết thúc (không bao gồm) của một lượt lưu trú; tối thiểu 1 ngày. */
export function stayEndExclusive(stay: StayRange): string {
  return stay.check_out > stay.check_in ? stay.check_out : addDaysIso(stay.check_in, 1);
}

export function staysOverlap(a: StayRange, b: StayRange): boolean {
  return a.check_in < stayEndExclusive(b) && b.check_in < stayEndExclusive(a);
}

export interface AvailabilityQuery {
  check_in: string;
  check_out: string;
  booking_type: BookingType;
  duration_hours?: number;
  room_type_id?: string;
  adults?: number;
}

export interface OfferPrice {
  currency: "VND";
  nights: number;
  base_amount: number;
  surcharge: number;
  tax_amount: number;
  total_amount: number;
  applied_overrides: string[];
}

export interface RoomTypeAvailability {
  room_type_id: string;
  code: string;
  name: string;
  description: string | null;
  max_guests: number;
  amenities: string[];
  photos: string[];
  total_rooms: number;
  booked_rooms: number;
  available_rooms: number;
  price: OfferPrice | null;
  /** Vì sao chưa có giá — để AI trả lời khách thay vì im lặng. */
  price_note: string | null;
}

export interface DayAvailability {
  date: string;
  total_rooms: number;
  available_rooms: number;
  by_room_type: Array<{
    code: string;
    name: string;
    available_rooms: number;
    total_amount: number | null;
  }>;
}

interface RoomTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  max_guests: number | null;
  amenities: string[] | null;
  photos: string[] | null;
  sort_order: number | null;
}

interface ReservationRow {
  room_type_id: string;
  check_in: string;
  check_out: string;
}

type RatePlanRow = RatePlan & {
  room_type_id: string;
  is_active?: boolean;
  priority?: number;
  valid_from?: string;
  valid_to?: string | null;
};

interface Inventory {
  types: RoomTypeRow[];
  roomsByType: Map<string, number>;
  reservations: ReservationRow[];
  plans: RatePlanRow[];
  overrides: RateOverride[];
}

/**
 * Một lần đọc DB cho cả khoảng [from, toExclusive): loại phòng, số phòng,
 * đặt phòng đang giữ chỗ, bảng giá và giá ngày lễ.
 */
async function loadInventory(
  db: SupabaseClient,
  propertyId: string,
  from: string,
  toExclusive: string,
  bookingType: BookingType,
  roomTypeId?: string,
): Promise<Inventory> {
  let typesQuery = db
    .from("room_types")
    .select("id, code, name, description, max_guests, amenities, photos, sort_order")
    .eq("property_id", propertyId)
    .eq("is_active", true);
  if (roomTypeId) typesQuery = typesQuery.eq("id", roomTypeId);

  const [typesRes, roomsRes, bookedRes, plansRes, overridesRes] = await Promise.all([
    typesQuery.order("sort_order"),
    db.from("rooms").select("room_type_id").eq("property_id", propertyId).eq("is_active", true),
    // Lọc thô ở DB (siêu tập của phép chồng lấn nửa mở), lọc tinh bằng staysOverlap.
    db
      .from("reservations")
      .select("room_type_id, check_in, check_out")
      .eq("property_id", propertyId)
      .in("status", ACTIVE_STATUSES)
      .lt("check_in", toExclusive)
      .gte("check_out", from),
    db
      .from("rate_plans")
      .select("*")
      .eq("property_id", propertyId)
      .eq("booking_type", bookingType)
      .eq("is_active", true),
    db
      .from("rate_overrides")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .gte("date", from)
      .lte("date", toExclusive),
  ]);

  const roomsByType = new Map<string, number>();
  for (const room of (roomsRes.data ?? []) as Array<{ room_type_id: string }>) {
    roomsByType.set(room.room_type_id, (roomsByType.get(room.room_type_id) ?? 0) + 1);
  }

  return {
    types: (typesRes.data ?? []) as RoomTypeRow[],
    roomsByType,
    reservations: (bookedRes.data ?? []) as ReservationRow[],
    plans: (plansRes.data ?? []) as RatePlanRow[],
    overrides: (overridesRes.data ?? []) as RateOverride[],
  };
}

/** Tồn phòng + giá của MỘT loại phòng cho MỘT khoảng ngày (thuần tính toán). */
function offerFor(
  type: RoomTypeRow,
  inventory: Inventory,
  vatRate: number,
  stay: StayRange,
  durationHours?: number,
): RoomTypeAvailability {
  const total = inventory.roomsByType.get(type.id) ?? 0;
  const booked = inventory.reservations.filter(
    (r) => r.room_type_id === type.id && staysOverlap(stay, r),
  ).length;

  const plan = pickActiveRatePlan(
    inventory.plans.filter((p) => p.room_type_id === type.id),
    stay.check_in,
  );

  let price: OfferPrice | null = null;
  let priceNote: string | null = null;

  if (!plan) {
    priceNote = "Chưa cấu hình bảng giá cho loại phòng này";
  } else {
    try {
      const breakdown = calculatePriceWithOverrides(
        plan,
        {
          check_in: stay.check_in,
          check_out: stay.check_out,
          duration_hours: durationHours,
        },
        inventory.overrides.filter(
          (o) => o.room_type_id === null || o.room_type_id === type.id,
        ),
      );
      const tax = computeVat(breakdown.total, vatRate);
      price = {
        currency: "VND",
        nights: breakdown.details.nights,
        base_amount: breakdown.base,
        surcharge: breakdown.surcharge,
        tax_amount: tax,
        total_amount: breakdown.total + tax,
        applied_overrides: breakdown.applied_overrides,
      };
    } catch (e) {
      priceNote = e instanceof Error ? e.message : "Không tính được giá";
    }
  }

  return {
    room_type_id: type.id,
    code: type.code,
    name: type.name,
    description: type.description,
    max_guests: type.max_guests ?? 2,
    amenities: type.amenities ?? [],
    photos: type.photos ?? [],
    total_rooms: total,
    booked_rooms: booked,
    available_rooms: Math.max(0, total - booked),
    price,
    price_note: priceNote,
  };
}

/** Tồn phòng + giá của từng loại phòng cho một khoảng ngày. Đúng 5 truy vấn. */
export async function loadAvailability(
  db: SupabaseClient,
  propertyId: string,
  vatRate: number,
  query: AvailabilityQuery,
): Promise<RoomTypeAvailability[]> {
  const stay: StayRange = { check_in: query.check_in, check_out: query.check_out };
  const inventory = await loadInventory(
    db,
    propertyId,
    query.check_in,
    stayEndExclusive(stay),
    query.booking_type,
    query.room_type_id,
  );

  const adults = query.adults ?? 0;
  return inventory.types
    .filter((t) => adults <= 0 || (t.max_guests ?? 2) >= adults)
    .map((t) => offerFor(t, inventory, vatRate, stay, query.duration_hours));
}

/**
 * Số phòng trống theo từng ngày trong [from, to]. Vẫn đúng 5 truy vấn cho cả
 * khoảng — mọi phép đếm theo ngày làm trong bộ nhớ.
 */
export async function loadCalendar(
  db: SupabaseClient,
  propertyId: string,
  vatRate: number,
  range: { from: string; to: string; room_type_id?: string },
): Promise<DayAvailability[]> {
  const dayCount = daysBetweenIso(range.from, range.to) + 1;
  const inventory = await loadInventory(
    db,
    propertyId,
    range.from,
    addDaysIso(range.to, 1),
    "overnight",
    range.room_type_id,
  );

  return Array.from({ length: dayCount }, (_, i) => {
    const date = addDaysIso(range.from, i);
    const stay: StayRange = { check_in: date, check_out: addDaysIso(date, 1) };
    const offers = inventory.types.map((t) => offerFor(t, inventory, vatRate, stay));
    return {
      date,
      total_rooms: offers.reduce((s, o) => s + o.total_rooms, 0),
      available_rooms: offers.reduce((s, o) => s + o.available_rooms, 0),
      by_room_type: offers.map((o) => ({
        code: o.code,
        name: o.name,
        available_rooms: o.available_rooms,
        total_amount: o.price?.total_amount ?? null,
      })),
    };
  });
}
