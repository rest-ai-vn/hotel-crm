import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { ratePlanCreateSchema, ratePlanUpdateSchema } from "../lib/schemas";

const ratePlans = new Hono();

ratePlans.get("/", async (c) => {
  const db = getServerDb();
  const roomTypeId = c.req.query("room_type_id");

  let query = db.from("rate_plans").select("*, room_types(name, code)");
  if (roomTypeId) query = query.eq("room_type_id", roomTypeId);

  const { data, error } = await query
    .order("room_type_id")
    .order("booking_type")
    .order("priority", { ascending: false });

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

ratePlans.post("/", async (c) => {
  const parsed = await parseBody(c, ratePlanCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const { data, error } = await db.from("rate_plans").insert(parsed.data).select().single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

ratePlans.put("/:id", async (c) => {
  const parsed = await parseBody(c, ratePlanUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("rate_plans")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

ratePlans.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();
  const { error } = await db.from("rate_plans").delete().eq("id", id);
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data: { id } });
});

export default ratePlans;
