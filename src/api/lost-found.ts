import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { lostFoundCreateSchema, lostFoundUpdateSchema } from "../lib/schemas";
import { logAudit } from "../lib/audit";

const lostFound = new Hono();

lostFound.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const status = c.req.query("status");
  let q = db
    .from("lost_found")
    .select("*, staff:created_by(name)")
    .eq("property_id", c.get("user").property_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "stored" || status === "returned") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

lostFound.post("/", async (c) => {
  const parsed = await parseBody(c, lostFoundCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");
  const insert: Record<string, unknown> = {
    item: parsed.data.item,
    location: parsed.data.location ?? null,
    note: parsed.data.note ?? null,
    created_by: user.sub,
    property_id: user.property_id,
  };
  if (parsed.data.found_on) insert.found_on = parsed.data.found_on;

  const { data, error } = await db.from("lost_found").insert(insert).select().single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "lost_found.create", "lost_found", data.id, { item: data.item });
  return c.json({ success: true, data }, 201);
});

lostFound.put("/:id", async (c) => {
  const parsed = await parseBody(c, lostFoundUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id") ?? "";
  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");

  const update: Record<string, unknown> = {};
  if (parsed.data.status) {
    update.status = parsed.data.status;
    if (parsed.data.status === "returned") update.returned_at = new Date().toISOString();
  }
  if (parsed.data.note !== undefined) update.note = parsed.data.note;
  if (Object.keys(update).length === 0) {
    return c.json({ success: false, error: "Không có gì để cập nhật" }, 400);
  }

  const { data, error } = await db
    .from("lost_found")
    .update(update)
    .eq("id", id)
    .eq("property_id", user.property_id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "lost_found.update", "lost_found", id, parsed.data);
  return c.json({ success: true, data });
});

export default lostFound;
