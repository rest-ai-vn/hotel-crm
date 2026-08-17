import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { ratePlanCreateSchema, ratePlanUpdateSchema } from "../lib/schemas";
import { logAudit } from "../lib/audit";

const ratePlans = new Hono();

ratePlans.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const roomTypeId = c.req.query("room_type_id");

  let query = db
    .from("rate_plans")
    .select("*, room_types(name, code)")
    .eq("property_id", c.get("user").property_id);
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

  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("rate_plans")
    .insert({ ...parsed.data, property_id: c.get("user").property_id })
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  await logAudit(db, c.get("user"), "rate_plan.create", "rate_plan", data.id, {
    name: data.name,
    booking_type: data.booking_type,
  });
  return c.json({ success: true, data }, 201);
});

ratePlans.put("/:id", async (c) => {
  const parsed = await parseBody(c, ratePlanUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("rate_plans")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  await logAudit(db, c.get("user"), "rate_plan.update", "rate_plan", id, parsed.data);
  return c.json({ success: true, data });
});

ratePlans.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = await getTenantDb(c.get("user").property_id);
  const pid = c.get("user").property_id;
  const { data: existing } = await db
    .from("rate_plans")
    .select("name, booking_type, room_type_id")
    .eq("id", id)
    .eq("property_id", pid)
    .maybeSingle();
  if (!existing) return c.json({ success: false, error: "Không tìm thấy bảng giá" }, 404);

  const { error } = await db.from("rate_plans").delete().eq("id", id).eq("property_id", pid);
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, c.get("user"), "rate_plan.delete", "rate_plan", id, existing ?? undefined);
  return c.json({ success: true, data: { id } });
});

export default ratePlans;
