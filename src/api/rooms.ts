import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import {
  roomCreateSchema,
  roomStatusSchema,
  roomTypeCreateSchema,
  roomTypeUpdateSchema,
} from "../lib/schemas";

const rooms = new Hono();

rooms.get("/types", async (c) => {
  const db = getServerDb();
  const includeInactive = c.req.query("all") === "1";
  let q = db
    .from("room_types")
    .select("*")
    .eq("property_id", c.get("user").property_id)
    .order("sort_order");
  if (!includeInactive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

rooms.post("/types", async (c) => {
  const parsed = await parseBody(c, roomTypeCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const { data, error } = await db
    .from("room_types")
    .insert({ ...parsed.data, property_id: c.get("user").property_id })
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

rooms.put("/types/:id", async (c) => {
  const parsed = await parseBody(c, roomTypeUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("room_types")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

rooms.get("/", async (c) => {
  const db = getServerDb();
  const floor = c.req.query("floor");
  const status = c.req.query("status");
  const typeId = c.req.query("type_id");

  let query = db
    .from("rooms")
    .select("*, room_types(name, code)")
    .eq("property_id", c.get("user").property_id)
    .eq("is_active", true);
  if (floor && /^\d+$/.test(floor)) query = query.eq("floor", Number(floor));
  if (status) query = query.eq("status", status);
  if (typeId) query = query.eq("room_type_id", typeId);

  const { data, error } = await query.order("floor").order("number");
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

rooms.post("/", async (c) => {
  const parsed = await parseBody(c, roomCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const { data, error } = await db
    .from("rooms")
    .insert({ ...parsed.data, property_id: c.get("user").property_id })
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

rooms.patch("/:id/status", async (c) => {
  const parsed = await parseBody(c, roomStatusSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const update: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "available") {
    update.last_cleaned_at = new Date().toISOString();
  }
  const { data, error } = await db
    .from("rooms")
    .update(update)
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

export default rooms;
