import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";

const rooms = new Hono();

// List room types
rooms.get("/types", async (c) => {
  const db = getServerDb();
  const { data, error } = await db
    .from("room_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

// Create room type
rooms.post("/types", async (c) => {
  const body = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("room_types").insert(body).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

// Update room type
rooms.put("/types/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("room_types").update(body).eq("id", id).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

// List rooms (with filters)
rooms.get("/", async (c) => {
  const db = getServerDb();
  const floor = c.req.query("floor");
  const status = c.req.query("status");
  const typeId = c.req.query("type_id");

  let query = db.from("rooms").select("*, room_types(name, code)").eq("is_active", true);
  if (floor) query = query.eq("floor", Number(floor));
  if (status) query = query.eq("status", status);
  if (typeId) query = query.eq("room_type_id", typeId);

  const { data, error } = await query.order("floor").order("number");
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

// Create room
rooms.post("/", async (c) => {
  const body = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("rooms").insert(body).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

// Update room status
rooms.patch("/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("rooms").update({ status }).eq("id", id).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

export default rooms;
