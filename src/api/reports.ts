import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { computeRevenueKpis, daysInRange } from "../lib/reports";

const reports = new Hono();

const REVENUE_STATUSES = ["confirmed", "checked_in", "checked_out"] as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Nights between two YYYY-MM-DD dates (min 1). */
function nights(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.floor((b - a) / 86_400_000));
}

interface ResRow {
  check_in: string;
  check_out: string;
  total_amount: number;
  services_total: number;
}

reports.get("/revenue", async (c) => {
  const from = c.req.query("from") || firstOfMonthIso();
  const to = c.req.query("to") || todayIso();
  const db = getServerDb();

  const pid = c.get("user").property_id;
  const [resRes, roomsRes] = await Promise.all([
    db
      .from("reservations")
      .select("check_in, check_out, total_amount, services_total")
      .eq("property_id", pid)
      .gte("check_in", from)
      .lte("check_in", to)
      .in("status", REVENUE_STATUSES as unknown as string[]),
    db
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("property_id", pid)
      .eq("is_active", true),
  ]);

  if (resRes.error) return c.json({ success: false, error: resRes.error.message }, 500);

  const rows = (resRes.data ?? []) as ResRow[];
  let roomRevenue = 0;
  let serviceRevenue = 0;
  let roomNightsSold = 0;
  for (const r of rows) {
    roomRevenue += r.total_amount ?? 0;
    serviceRevenue += r.services_total ?? 0;
    roomNightsSold += nights(r.check_in, r.check_out);
  }

  const totalRooms = roomsRes.count ?? 0;
  const days = daysInRange(from, to);
  const kpis = computeRevenueKpis(roomRevenue, serviceRevenue, roomNightsSold, totalRooms, days);

  return c.json({
    success: true,
    data: {
      from,
      to,
      days,
      total_rooms: totalRooms,
      reservation_count: rows.length,
      ...kpis,
    },
  });
});

// ── Breakdown reports: by source / room type / staff / nationality ──
type BreakdownKey = "source" | "room_type" | "staff" | "nationality";

interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  amount: number;
}

function addRow(map: Map<string, BreakdownRow>, key: string, label: string, amount: number) {
  const existing = map.get(key);
  if (existing) {
    map.set(key, { ...existing, count: existing.count + 1, amount: existing.amount + amount });
  } else {
    map.set(key, { key, label, count: 1, amount });
  }
}

reports.get("/breakdown", async (c) => {
  const by = (c.req.query("by") || "source") as BreakdownKey;
  const from = c.req.query("from") || firstOfMonthIso();
  const to = c.req.query("to") || todayIso();
  const db = getServerDb();
  const pid = c.get("user").property_id;
  const map = new Map<string, BreakdownRow>();

  if (by === "staff") {
    const { data, error } = await db
      .from("payments")
      .select("amount, kind, received_by, staff:received_by(name)")
      .eq("property_id", pid)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59.999`);
    if (error) return c.json({ success: false, error: error.message }, 500);
    for (const p of (data ?? []) as unknown as Array<{
      amount: number;
      kind: string;
      received_by: string | null;
      staff: { name: string } | null;
    }>) {
      const signed = p.kind === "refund" ? -(p.amount ?? 0) : (p.amount ?? 0);
      addRow(map, p.received_by ?? "unknown", p.staff?.name ?? "(không rõ)", signed);
    }
  } else if (by === "nationality") {
    const { data, error } = await db
      .from("reservations")
      .select("total_amount, services_total, guests(nationality)")
      .eq("property_id", pid)
      .gte("check_in", from)
      .lte("check_in", to)
      .in("status", REVENUE_STATUSES as unknown as string[]);
    if (error) return c.json({ success: false, error: error.message }, 500);
    for (const r of (data ?? []) as unknown as Array<{
      total_amount: number;
      services_total: number;
      guests: { nationality: string | null } | null;
    }>) {
      const nat = r.guests?.nationality || "VN";
      addRow(map, nat, nat, (r.total_amount ?? 0) + (r.services_total ?? 0));
    }
  } else if (by === "room_type") {
    const { data, error } = await db
      .from("reservations")
      .select("total_amount, services_total, room_types(name)")
      .eq("property_id", pid)
      .gte("check_in", from)
      .lte("check_in", to)
      .in("status", REVENUE_STATUSES as unknown as string[]);
    if (error) return c.json({ success: false, error: error.message }, 500);
    for (const r of (data ?? []) as unknown as Array<{
      total_amount: number;
      services_total: number;
      room_types: { name: string } | null;
    }>) {
      const name = r.room_types?.name ?? "(không rõ)";
      addRow(map, name, name, (r.total_amount ?? 0) + (r.services_total ?? 0));
    }
  } else {
    const { data, error } = await db
      .from("reservations")
      .select("source, total_amount, services_total")
      .eq("property_id", pid)
      .gte("check_in", from)
      .lte("check_in", to)
      .in("status", REVENUE_STATUSES as unknown as string[]);
    if (error) return c.json({ success: false, error: error.message }, 500);
    for (const r of (data ?? []) as Array<{
      source: string;
      total_amount: number;
      services_total: number;
    }>) {
      addRow(map, r.source ?? "walk_in", r.source ?? "walk_in", (r.total_amount ?? 0) + (r.services_total ?? 0));
    }
  }

  const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
  return c.json({ success: true, data: { by, from, to, rows } });
});

// ── Residence declaration (khai báo lưu trú) ──
reports.get("/residence", async (c) => {
  const date = c.req.query("date") || todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ success: false, error: "date must be YYYY-MM-DD" }, 400);
  }
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .select(
      "id, check_in, check_out, guests(name, id_number, id_type, nationality, address, phone), rooms(number)",
    )
    .eq("property_id", c.get("user").property_id)
    .eq("status", "checked_in")
    .lte("check_in", date)
    .gte("check_out", date);
  if (error) return c.json({ success: false, error: error.message }, 500);

  const rows = ((data ?? []) as unknown as Array<{
    check_in: string;
    check_out: string;
    guests: {
      name: string;
      id_number: string | null;
      id_type: string | null;
      nationality: string | null;
      address: string | null;
      phone: string | null;
    } | null;
    rooms: { number: string } | null;
  }>).map((r) => ({
    guest_name: r.guests?.name ?? "",
    id_number: r.guests?.id_number ?? null,
    id_type: r.guests?.id_type ?? null,
    nationality: r.guests?.nationality ?? "VN",
    address: r.guests?.address ?? null,
    phone: r.guests?.phone ?? null,
    room_number: r.rooms?.number ?? null,
    check_in: r.check_in,
    check_out: r.check_out,
  }));

  return c.json({ success: true, data: { date, rows } });
});

export default reports;
