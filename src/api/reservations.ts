import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import {
  reservationCancelSchema,
  reservationCheckInSchema,
  reservationCreateSchema,
  reservationUpdateSchema,
} from "../lib/schemas";

const reservations = new Hono();

reservations.get("/availability", async (c) => {
  const db = getServerDb();
  const roomTypeId = c.req.query("room_type_id");
  const date = c.req.query("date");

  if (!roomTypeId || !date) {
    return c.json({ success: false, error: "room_type_id and date required" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ success: false, error: "date must be YYYY-MM-DD" }, 400);
  }

  const { count: totalRooms } = await db
    .from("rooms")
    .select("*", { count: "exact", head: true })
    .eq("room_type_id", roomTypeId)
    .eq("is_active", true);

  const { count: bookedRooms } = await db
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("room_type_id", roomTypeId)
    .in("status", ["confirmed", "checked_in"])
    .lte("check_in", date)
    .gte("check_out", date);

  const total = totalRooms ?? 0;
  const booked = bookedRooms ?? 0;
  const available = Math.max(0, total - booked);

  return c.json({
    success: true,
    data: { room_type_id: roomTypeId, date, total, booked, available },
  });
});

reservations.get("/", async (c) => {
  const db = getServerDb();
  const from = c.req.query("from");
  const to = c.req.query("to");
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);

  let query = db
    .from("reservations")
    .select(
      "*, guests(name, phone), room_types(name, code), rooms(number, floor)",
      { count: "exact" },
    );

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("check_in", from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("check_in", to);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query
    .order("check_in", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data, meta: { total: count, limit, offset } });
});

reservations.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .select("*, guests(name, phone, id_number), room_types(name), rooms(number, floor)")
    .eq("id", id)
    .maybeSingle();

  if (error) return c.json({ success: false, error: error.message }, 500);
  if (!data) return c.json({ success: false, error: "Reservation not found" }, 404);
  return c.json({ success: true, data });
});

reservations.post("/", async (c) => {
  const parsed = await parseBody(c, reservationCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

reservations.put("/:id", async (c) => {
  const parsed = await parseBody(c, reservationUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

reservations.post("/:id/cancel", async (c) => {
  const parsed = await parseBody(c, reservationCancelSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: parsed.data.reason ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

reservations.post("/:id/check-in", async (c) => {
  const parsed = await parseBody(c, reservationCheckInSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const { room_id } = parsed.data;
  const db = getServerDb();

  const { data, error } = await db
    .from("reservations")
    .update({ status: "checked_in", room_id })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);

  await db.from("rooms").update({ status: "occupied" }).eq("id", room_id);

  return c.json({ success: true, data });
});

reservations.post("/:id/check-out", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();

  const { data: reservation, error: fetchErr } = await db
    .from("reservations")
    .select("room_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return c.json({ success: false, error: fetchErr.message }, 400);
  if (!reservation) return c.json({ success: false, error: "Reservation not found" }, 404);

  const { data, error } = await db
    .from("reservations")
    .update({
      status: "checked_out",
      check_out_time: new Date().toTimeString().slice(0, 5),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);

  if (reservation.room_id) {
    await db.from("rooms").update({ status: "cleaning" }).eq("id", reservation.room_id);
  }

  return c.json({ success: true, data });
});

export default reservations;
