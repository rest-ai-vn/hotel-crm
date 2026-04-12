import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";

const reservations = new Hono();

// List reservations (with date range filter)
reservations.get("/", async (c) => {
  const db = getServerDb();
  const from = c.req.query("from"); // DD/MM/YYYY or YYYY-MM-DD
  const to = c.req.query("to");
  const status = c.req.query("status");
  const limit = Number(c.req.query("limit") || 50);
  const offset = Number(c.req.query("offset") || 0);

  let query = db
    .from("reservations")
    .select("*, guests(name, phone), room_types(name, code), rooms(number, floor)", { count: "exact" });

  if (from) query = query.gte("check_in", from);
  if (to) query = query.lte("check_in", to);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query
    .order("check_in", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data, meta: { total: count, limit, offset } });
});

// Get single reservation
reservations.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .select("*, guests(name, phone, id_number), room_types(name), rooms(number, floor)")
    .eq("id", id)
    .single();

  if (error) return c.json({ success: false, error: error.message }, 404);
  return c.json({ success: true, data });
});

// Create reservation
reservations.post("/", async (c) => {
  const body = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("reservations").insert(body).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

// Update reservation
reservations.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("reservations").update(body).eq("id", id).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

// Cancel reservation
reservations.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const { reason } = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

// Check-in
reservations.post("/:id/check-in", async (c) => {
  const id = c.req.param("id");
  const { room_id } = await c.req.json();
  const db = getServerDb();

  // Assign room + update status
  const { data, error } = await db
    .from("reservations")
    .update({ status: "checked_in", room_id })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);

  // Update room status to occupied
  if (room_id) {
    await db.from("rooms").update({ status: "occupied" }).eq("id", room_id);
  }

  return c.json({ success: true, data });
});

// Check-out
reservations.post("/:id/check-out", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();

  const { data: reservation, error: fetchErr } = await db
    .from("reservations")
    .select("room_id")
    .eq("id", id)
    .single();

  if (fetchErr) return c.json({ success: false, error: fetchErr.message }, 400);

  const { data, error } = await db
    .from("reservations")
    .update({ status: "checked_out", check_out_time: new Date().toTimeString().slice(0, 5) })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);

  // Set room to cleaning
  if (reservation?.room_id) {
    await db.from("rooms").update({ status: "cleaning" }).eq("id", reservation.room_id);
  }

  return c.json({ success: true, data });
});

// Check availability — used by chatbot and dashboard
reservations.get("/availability", async (c) => {
  const db = getServerDb();
  const roomTypeId = c.req.query("room_type_id");
  const date = c.req.query("date"); // YYYY-MM-DD

  if (!roomTypeId || !date) {
    return c.json({ success: false, error: "room_type_id and date required" }, 400);
  }

  // Count total rooms of this type
  const { count: totalRooms } = await db
    .from("rooms")
    .select("*", { count: "exact", head: true })
    .eq("room_type_id", roomTypeId)
    .eq("is_active", true);

  // Count occupied/reserved rooms on this date
  const { count: bookedRooms } = await db
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("room_type_id", roomTypeId)
    .in("status", ["confirmed", "checked_in"])
    .lte("check_in", date)
    .gte("check_out", date);

  const available = (totalRooms || 0) - (bookedRooms || 0);

  return c.json({
    success: true,
    data: {
      room_type_id: roomTypeId,
      date,
      total: totalRooms || 0,
      booked: bookedRooms || 0,
      available: Math.max(0, available),
    },
  });
});

export default reservations;
