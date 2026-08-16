import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { rateOverrideCreateSchema, rateOverrideUpdateSchema } from "../lib/schemas";
import { logAudit } from "../lib/audit";

const rateOverrides = new Hono();

rateOverrides.get("/", async (c) => {
  const db = getServerDb();
  const from = c.req.query("from");
  const to = c.req.query("to");

  let q = db
    .from("rate_overrides")
    .select("*, room_types(name, code)")
    .eq("property_id", c.get("user").property_id)
    .order("date", { ascending: true });
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("date", from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("date", to);

  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

rateOverrides.post("/", async (c) => {
  const parsed = await parseBody(c, rateOverrideCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const user = c.get("user");
  const { data, error } = await db
    .from("rate_overrides")
    .insert({ ...parsed.data, property_id: user.property_id })
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "rate_override.create", "rate_override", data.id, {
    name: data.name,
    date: data.date,
  });
  return c.json({ success: true, data }, 201);
});

rateOverrides.put("/:id", async (c) => {
  const parsed = await parseBody(c, rateOverrideUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const user = c.get("user");
  const { data, error } = await db
    .from("rate_overrides")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", user.property_id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "rate_override.update", "rate_override", id, parsed.data);
  return c.json({ success: true, data });
});

rateOverrides.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();
  const user = c.get("user");
  const { error } = await db
    .from("rate_overrides")
    .delete()
    .eq("id", id)
    .eq("property_id", user.property_id);
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "rate_override.delete", "rate_override", id);
  return c.json({ success: true, data: { id } });
});

export default rateOverrides;
