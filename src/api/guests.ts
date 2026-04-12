import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";

const guests = new Hono();

// List guests (search by name, phone, zalo_id)
guests.get("/", async (c) => {
  const db = getServerDb();
  const search = c.req.query("q");
  const limit = Number(c.req.query("limit") || 50);
  const offset = Number(c.req.query("offset") || 0);

  let query = db.from("guests").select("*", { count: "exact" });
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,zalo_id.eq.${search}`);
  }

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data, meta: { total: count, limit, offset } });
});

// Get single guest
guests.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db.from("guests").select("*").eq("id", id).single();

  if (error) return c.json({ success: false, error: error.message }, 404);
  return c.json({ success: true, data });
});

// Create guest
guests.post("/", async (c) => {
  const body = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("guests").insert(body).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

// Update guest
guests.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getServerDb();
  const { data, error } = await db.from("guests").update(body).eq("id", id).select().single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

// Find or create guest by phone/zalo_id (used by chatbot)
guests.post("/find-or-create", async (c) => {
  const { phone, zalo_id, facebook_id, name } = await c.req.json();
  const db = getServerDb();

  // Try find by zalo_id first, then phone
  if (zalo_id) {
    const { data } = await db.from("guests").select("*").eq("zalo_id", zalo_id).single();
    if (data) return c.json({ success: true, data, created: false });
  }
  if (phone) {
    const { data } = await db.from("guests").select("*").eq("phone", phone).single();
    if (data) {
      // Link zalo_id if missing
      if (zalo_id && !data.zalo_id) {
        await db.from("guests").update({ zalo_id }).eq("id", data.id);
      }
      return c.json({ success: true, data, created: false });
    }
  }

  // Create new guest
  const { data, error } = await db
    .from("guests")
    .insert({ name: name || "Khách", phone, zalo_id, facebook_id })
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data, created: true }, 201);
});

export default guests;
