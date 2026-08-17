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
  last_cleaned_at?: string | null;
  cleaning_assignee?: string | null;
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
  loyalty_points: number;
  notes: string | null;
  tags: string[];
  is_blacklisted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  is_active: boolean;
  sort_order: number;
}

export interface ReservationService {
  id: string;
  reservation_id: string;
  service_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  note: string | null;
  created_at: string;
}

export type CashDirection = "income" | "expense";

export interface CashTransaction {
  id: string;
  direction: CashDirection;
  category: string;
  amount: number;
  note: string | null;
  occurred_on: string;
  reservation_id: string | null;
  created_at: string;
}

export interface CashSummary {
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface RevenueReport {
  from: string;
  to: string;
  days: number;
  total_rooms: number;
  reservation_count: number;
  room_revenue: number;
  service_revenue: number;
  total_revenue: number;
  room_nights_sold: number;
  available_room_nights: number;
  occupancy_pct: number;
  adr: number;
  revpar: number;
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
  services_total?: number;
  group_code?: string | null;
  voucher_id?: string | null;
  company_id?: string | null;
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

export type PaymentMethod = "cash" | "card" | "transfer" | "vietqr";
export type PaymentKind = "payment" | "deposit" | "refund";

export interface Payment {
  id: string;
  reservation_id: string;
  amount: number;
  method: PaymentMethod;
  kind: PaymentKind;
  note: string | null;
  received_by: string | null;
  created_at: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  is_active?: boolean;
  property_id?: string;
  property_name?: string | null;
}

export interface Property {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  vat_rate?: number;
  bank_id?: string | null;
  bank_account_no?: string | null;
  bank_account_name?: string | null;
}

export interface Voucher {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  valid_from: string;
  valid_to: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  tax_code: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  is_active: boolean;
  discount_pct?: number;
}

export type WorkOrderStatus = "open" | "in_progress" | "done";

export interface WorkOrder {
  id: string;
  room_id: string | null;
  title: string;
  note: string | null;
  status: WorkOrderStatus;
  created_at: string;
  resolved_at: string | null;
  rooms?: { number: string; floor: number } | null;
  staff?: { name: string } | null;
}

export interface ReceivablesReport {
  companies: Array<{ company_id: string; company_name: string; count: number; outstanding: number }>;
  details: Array<{
    reservation_id: string;
    confirmation_code: string;
    check_in: string;
    company_name: string;
    outstanding: number;
  }>;
}

export interface ChainReport {
  from: string;
  to: string;
  total: number;
  rows: BreakdownRow[];
}

// ── Shifts (giao ca) ──
export interface ShiftSummary {
  opening_cash: number;
  cash_collected: number;
  cash_refunded: number;
  noncash_collected: number;
  cashbook_income: number;
  cashbook_expense: number;
  expected_cash: number;
}

export interface Shift {
  id: string;
  staff_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  expected_cash: number | null;
  counted_cash: number | null;
  variance: number | null;
  note: string | null;
  staff?: { name: string } | null;
  summary?: ShiftSummary;
}

// ── Night audit (chốt ngày) ──
export interface NightAuditStats {
  arrivals: number;
  departures: number;
  in_house: number;
  payments_collected: number;
  payments_refunded: number;
  cashbook_income: number;
  cashbook_expense: number;
}

export interface NoShowCandidate {
  id: string;
  confirmation_code: string;
  check_in: string;
  total_amount: number;
  guests: { name: string; phone: string | null } | null;
  room_types: { name: string } | null;
}

export interface NightAuditPreview {
  business_date: string;
  already_closed: boolean;
  no_show_candidates: NoShowCandidate[];
  stats: NightAuditStats;
}

export interface NightAuditRecord {
  id: string;
  business_date: string;
  closed_by: string | null;
  closed_at: string;
  no_show_count: number;
  stats: NightAuditStats;
  note: string | null;
  staff?: { name: string } | null;
}

// ── Audit log ──
export interface AuditLog {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ── Rate overrides (giá ngày lễ) ──
export interface RateOverride {
  id: string;
  name: string;
  date: string;
  room_type_id: string | null;
  surcharge_pct: number;
  fixed_hourly: number | null;
  fixed_overnight: number | null;
  fixed_daytime: number | null;
  is_active: boolean;
  room_types?: { name: string; code: string } | null;
}

// ── Reports ──
export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  amount: number;
}

export interface BreakdownReport {
  by: "source" | "room_type" | "staff" | "nationality";
  from: string;
  to: string;
  rows: BreakdownRow[];
}

export interface ResidenceRow {
  guest_name: string;
  id_number: string | null;
  id_type: string | null;
  nationality: string | null;
  address: string | null;
  phone: string | null;
  room_number: string | null;
  check_in: string;
  check_out: string;
}

export interface ResidenceReport {
  date: string;
  rows: ResidenceRow[];
}
