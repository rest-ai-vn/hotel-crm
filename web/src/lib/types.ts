export type RoomStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "cleaning"
  | "maintenance"
  | "out_of_order";

export type ReservationStatus =
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export type BookingType = "hourly" | "overnight" | "daytime";

export type PaymentStatus = "pending" | "partial" | "paid" | "refunded";

export type GuestSource =
  | "walk_in"
  | "zalo"
  | "facebook"
  | "phone"
  | "ota_agoda"
  | "ota_booking"
  | "ota_traveloka"
  | "website";

export type StaffRole = "admin" | "manager" | "receptionist" | "housekeeping";

export interface RoomType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  max_guests: number;
  amenities: string[];
  photos: string[];
  sort_order: number;
  is_active: boolean;
}

export interface Room {
  id: string;
  room_type_id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  notes: string | null;
  is_active: boolean;
  room_types?: { name: string; code: string };
}

export interface Guest {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  id_number: string | null;
  id_type: string | null;
  nationality: string | null;
  address: string | null;
  zalo_id: string | null;
  facebook_id: string | null;
  visit_count: number;
  total_revenue: number;
  loyalty_tier: string;
  notes: string | null;
  tags: string[];
  is_blacklisted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: string;
  guest_id: string;
  room_type_id: string;
  room_id: string | null;
  booking_type: BookingType;
  status: ReservationStatus;
  source: GuestSource;
  check_in: string;
  check_in_time: string | null;
  check_out: string;
  check_out_time: string | null;
  duration_hours: number | null;
  adults: number;
  children: number;
  base_amount: number;
  surcharge: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_status: PaymentStatus;
  notes: string | null;
  internal_notes: string | null;
  confirmation_code: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  guests?: { name: string; phone: string | null };
  room_types?: { name: string; code: string };
  rooms?: { number: string; floor: number } | null;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  is_active?: boolean;
}
