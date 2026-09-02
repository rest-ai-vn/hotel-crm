import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import {
  roomAssignSchema,
  roomCreateSchema,
  roomStatusSchema,
  roomTypeCreateSchema,
  roomTypeUpdateSchema,
} from "../lib/schemas";
import { requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const rooms = new Hono();

rooms.get("/types", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
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

  const db = await getTenantDb(c.get("user").property_id);
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
  const db = await getTenantDb(c.get("user").property_id);
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
  const db = await getTenantDb(c.get("user").property_id);
  const floor = c.req.query("floor");
  const status = c.req.query("status");
  const typeId = c.req.query("type_id");

  let query = db
    .from("rooms")
    .select("*, room_types(name, code), staff:cleaning_assignee(name)")
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

  const db = await getTenantDb(c.get("user").property_id);
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
  const db = await getTenantDb(c.get("user").property_id);
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

// Assign (or clear) a housekeeper responsible for cleaning this room.
rooms.patch("/:id/assign", async (c) => {
  const parsed = await parseBody(c, roomAssignSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id") ?? "";
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("rooms")
    .update({ cleaning_assignee: parsed.data.staff_id })
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .select("*, staff:cleaning_assignee(name)")
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

// Xóa phòng. Phòng đã từng có khách ở KHÔNG bị xóa cứng — chỉ ngừng sử dụng,
// để hóa đơn, báo cáo và nhật ký cũ không mất tham chiếu.
rooms.delete("/:id", requireRole("admin", "manager"), async (c) => {
  const id = c.req.param("id") ?? "";
  const user = c.get("user");
  const db = await getTenantDb(user.property_id);

  const { data: room } = await db
    .from("rooms")
    .select("id, number, status")
    .eq("id", id)
    .eq("property_id", user.property_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!room) return c.json({ success: false, error: "Không tìm thấy phòng" }, 404);

  if (room.status === "occupied") {
    return c.json(
      { success: false, error: `Phòng ${room.number} đang có khách ở — trả phòng trước khi xóa` },
      409,
    );
  }

  const { count: holding } = await db
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("property_id", user.property_id)
    .eq("room_id", id)
    .in("status", ["confirmed", "checked_in"]);
  if ((holding ?? 0) > 0) {
    return c.json(
      {
        success: false,
        error: `Phòng ${room.number} còn ${holding} đặt phòng đang giữ chỗ — đổi phòng hoặc hủy trước khi xóa`,
      },
      409,
    );
  }

  const { count: history } = await db
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("property_id", user.property_id)
    .eq("room_id", id);

  if ((history ?? 0) > 0) {
    const { error } = await db
      .from("rooms")
      .update({ is_active: false })
      .eq("id", id)
      .eq("property_id", user.property_id);
    if (error) return c.json({ success: false, error: error.message }, 400);

    await logAudit(db, user, "room.archive", "room", id, {
      number: room.number,
      past_reservations: history,
    });
    return c.json({
      success: true,
      data: { id, number: room.number, mode: "archived", past_reservations: history },
    });
  }

  const { error } = await db
    .from("rooms")
    .delete()
    .eq("id", id)
    .eq("property_id", user.property_id);
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "room.delete", "room", id, { number: room.number });
  return c.json({ success: true, data: { id, number: room.number, mode: "deleted" } });
});

export default rooms;
