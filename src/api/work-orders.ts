import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { workOrderCreateSchema, workOrderUpdateSchema } from "../lib/schemas";
import { logAudit } from "../lib/audit";

const workOrders = new Hono();

workOrders.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const status = c.req.query("status");
  let q = db
    .from("work_orders")
    .select("*, rooms(number, floor), staff:created_by(name)")
    .eq("property_id", c.get("user").property_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "open" || status === "in_progress" || status === "done") {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

workOrders.post("/", async (c) => {
  const parsed = await parseBody(c, workOrderCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");

  if (parsed.data.room_id) {
    const { data: room } = await db
      .from("rooms")
      .select("id")
      .eq("id", parsed.data.room_id)
      .eq("property_id", user.property_id)
      .maybeSingle();
    if (!room) return c.json({ success: false, error: "Phòng không tồn tại" }, 404);
  }

  const { data, error } = await db
    .from("work_orders")
    .insert({
      room_id: parsed.data.room_id ?? null,
      title: parsed.data.title,
      note: parsed.data.note ?? null,
      created_by: user.sub,
      property_id: user.property_id,
    })
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  if (parsed.data.set_room_maintenance && parsed.data.room_id) {
    await db
      .from("rooms")
      .update({ status: "maintenance" })
      .eq("id", parsed.data.room_id)
      .eq("property_id", user.property_id);
  }

  await logAudit(db, user, "work_order.create", "work_order", data.id, {
    title: data.title,
    room_id: data.room_id,
  });
  return c.json({ success: true, data }, 201);
});

workOrders.put("/:id", async (c) => {
  const parsed = await parseBody(c, workOrderUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id") ?? "";
  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");

  const update: Record<string, unknown> = {};
  if (parsed.data.status) {
    update.status = parsed.data.status;
    if (parsed.data.status === "done") update.resolved_at = new Date().toISOString();
  }
  if (parsed.data.note !== undefined) update.note = parsed.data.note;
  if (Object.keys(update).length === 0) {
    return c.json({ success: false, error: "Không có gì để cập nhật" }, 400);
  }

  const { data, error } = await db
    .from("work_orders")
    .update(update)
    .eq("id", id)
    .eq("property_id", user.property_id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  // Optionally put the room back to cleaning once the fix is done.
  if (parsed.data.release_room && parsed.data.status === "done" && data.room_id) {
    await db
      .from("rooms")
      .update({ status: "cleaning" })
      .eq("id", data.room_id)
      .eq("property_id", user.property_id);
  }

  await logAudit(db, user, "work_order.update", "work_order", id, parsed.data);
  return c.json({ success: true, data });
});

export default workOrders;
