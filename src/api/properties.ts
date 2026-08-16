import { Hono } from "hono";
import { z } from "zod";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { logAudit } from "../lib/audit";

const properties = new Hono();

const propertyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
});
const propertyUpdateSchema = propertyCreateSchema.partial().extend({
  is_active: z.boolean().optional(),
});

properties.get("/", async (c) => {
  const db = getServerDb();
  const { data, error } = await db
    .from("properties")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

properties.post("/", async (c) => {
  const parsed = await parseBody(c, propertyCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const user = c.get("user");
  const { data, error } = await db.from("properties").insert(parsed.data).select().single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "property.create", "property", data.id, {
    name: data.name,
    code: data.code,
  });
  return c.json({ success: true, data }, 201);
});

properties.put("/:id", async (c) => {
  const parsed = await parseBody(c, propertyUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id") ?? "";
  const db = getServerDb();
  const { data, error } = await db
    .from("properties")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, c.get("user"), "property.update", "property", id, parsed.data);
  return c.json({ success: true, data });
});

export default properties;
