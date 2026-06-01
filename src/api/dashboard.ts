import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";

const dashboard = new Hono();

const ACTIVE_STATUSES = ["confirmed", "checked_in"] as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface RoomRow {
  id: string;
  status: string;
}
interface ReservationRow {
  id: string;
  status: string;
  check_in: string;
  check_out: string;
  total_amount: number;
  room_id: string | null;
  confirmation_code: string;
  guests: { name: string; phone: string | null } | null;
  room_types: { name: string; code: string } | null;
  rooms: { number: string; floor: number } | null;
}

dashboard.get("/summary", async (c) => {
  const db = getServerDb();
  const today = todayIso();

  const [roomsRes, arrivalsRes, departuresRes, inhouseRes] = await Promise.all([
    db.from("rooms").select("id, status").eq("is_active", true),
    db
      .from("reservations")
      .select(
        "id, status, check_in, check_out, total_amount, room_id, confirmation_code, guests(name, phone), room_types(name, code), rooms(number, floor)",
      )
      .eq("check_in", today)
      .in("status", ACTIVE_STATUSES as unknown as string[])
      .order("check_in_time", { ascending: true }),
    db
      .from("reservations")
      .select(
        "id, status, check_in, check_out, total_amount, room_id, confirmation_code, guests(name, phone), room_types(name, code), rooms(number, floor)",
      )
      .eq("check_out", today)
      .in("status", ["checked_in", "checked_out"])
      .order("check_out_time", { ascending: true }),
    db
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "checked_in"),
  ]);

  if (roomsRes.error) return c.json({ success: false, error: roomsRes.error.message }, 500);
  if (arrivalsRes.error) return c.json({ success: false, error: arrivalsRes.error.message }, 500);
  if (departuresRes.error) return c.json({ success: false, error: departuresRes.error.message }, 500);

  const rooms = (roomsRes.data ?? []) as RoomRow[];
  const totalRooms = rooms.length;
  const statusCounts: Record<string, number> = {};
  for (const r of rooms) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  const occupied = statusCounts["occupied"] ?? 0;
  const occupancyPct = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

  const arrivals = (arrivalsRes.data ?? []) as unknown as ReservationRow[];
  const departures = (departuresRes.data ?? []) as unknown as ReservationRow[];
  const inhouseCount = inhouseRes.count ?? 0;

  const todayRevenue = [...arrivals, ...departures].reduce(
    (sum, r) => sum + (r.total_amount ?? 0),
    0,
  );

  return c.json({
    success: true,
    data: {
      date: today,
      total_rooms: totalRooms,
      occupied,
      occupancy_pct: occupancyPct,
      room_status: statusCounts,
      arrivals_count: arrivals.length,
      departures_count: departures.length,
      inhouse_count: inhouseCount,
      today_revenue: todayRevenue,
      arrivals,
      departures,
    },
  });
});

export default dashboard;
