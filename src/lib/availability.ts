// Tồn phòng + báo giá dùng chung cho API AI.
//
// Quy ước chồng lấn: nửa mở [check_in, check_out) — đúng bằng ràng buộc
// `no_double_book_overnight` ở DB (migration 011), nên khách trả phòng ngày 5
// thì phòng đó ngày 5 lại trống. Đặt theo giờ / theo ngày (check_out == check_in)
// được quy về đúng một ngày [check_in, check_in+1).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculatePriceWithOverrides,
  pickActiveRatePlan,
  type BookingType,
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

/**
 * Tồn phòng + giá của từng loại phòng cho một khoảng ngày.
 * Luôn 5 truy vấn, không phụ thuộc số loại phòng (tránh N+1).
 */
export async function loadAvailability(
  db: SupabaseClient,
  propertyId: string,
  vatRate: number,
  query: AvailabilityQuery,
): Promise<RoomTypeAvailability[]> {
  const stay: StayRange = { check_in: query.check_in, check_out: query.check_out };
  const endExclusive = stayEndExclusive(stay);

  let typesQuery = db
    .from("room_types")
    .select("id, code, name, description, max_guests, amenities, photos, sort_order")
    .eq("property_id", propertyId)
    .eq("is_active", true);
  if (query.room_type_id) typesQuery = typesQuery.eq("id", query.room_type_id);

  const [typesRes, roomsRes, bookedRes, plansRes, overridesRes] = await Promise.all([
    typesQuery.order("sort_order"),
    db.from("rooms").select("room_type_id").eq("property_id", propertyId).eq("is_active", true),
    // Lọc thô ở DB (siêu tập của phép chồng lấn nửa mở), lọc tinh bằng staysOverlap.
    db
      .from("reservations")
      .select("room_type_id, check_in, check_out")
      .eq("property_id", propertyId)
      .in("status", ACTIVE_STATUSES)
      .lt("check_in", endExclusive)
      .gte("check_out", query.check_in),
    db
      .from("rate_plans")
      .select("*")
      .eq("property_id", propertyId)
      .eq("booking_type", query.booking_type)
      .eq("is_active", true),
    db
      .from("rate_overrides")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .gte("date", query.check_in)
      .lte("date", endExclusive),
  ]);

  const types = (typesRes.data ?? []) as RoomTypeRow[];
  const rooms = (roomsRes.data ?? []) as Array<{ room_type_id: string }>;
  const booked = ((bookedRes.data ?? []) as ReservationRow[]).filter((r) => staysOverlap(stay, r));
  const plans = plansRes.data ?? [];
  const overrides = (overridesRes.data ?? []) as RateOverride[];

  const totalByType = new Map<string, number>();
  for (const room of rooms) {
    totalByType.set(room.room_type_id, (totalByType.get(room.room_type_id) ?? 0) + 1);
  }
  const bookedByType = new Map<string, number>();
  for (const row of booked) {
    bookedByType.set(row.room_type_id, (bookedByType.get(row.room_type_id) ?? 0) + 1);
  }

  const adults = query.adults ?? 0;

  return types
    .filter((t) => adults <= 0 || (t.max_guests ?? 2) >= adults)
    .map((t) => {
      const total = totalByType.get(t.id) ?? 0;
      const used = bookedByType.get(t.id) ?? 0;
      const plan = pickActiveRatePlan(
        plans.filter((p) => p.room_type_id === t.id),
        query.check_in,
      );

      let price: OfferPrice | null = null;
      let priceNote: string | null = null;
      if (!plan) {
        priceNote = `Chưa cấu hình bảng giá ${query.booking_type} cho loại phòng này`;
      } else {
        try {
          const applicable = overrides.filter(
            (o) => o.room_type_id === null || o.room_type_id === t.id,
          );
          const breakdown = calculatePriceWithOverrides(
            plan,
            {
              check_in: query.check_in,
              check_out: query.check_out,
              duration_hours: query.duration_hours,
            },
            applicable,
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
        room_type_id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        max_guests: t.max_guests ?? 2,
        amenities: t.amenities ?? [],
        photos: t.photos ?? [],
        total_rooms: total,
        booked_rooms: used,
        available_rooms: Math.max(0, total - used),
        price,
        price_note: priceNote,
      };
    });
}
