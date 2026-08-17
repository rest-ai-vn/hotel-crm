import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { serviceCreateSchema, serviceUpdateSchema, serviceChargeSchema } from "../lib/schemas";
import { requireRole } from "../middleware/auth";

const services = new Hono();

// ── Service catalog ──────────────────────────────────
services.get("/catalog", async (c) => {
  const includeInactive = c.req.query("all") === "1";
  const db = await getTenantDb(c.get("user").property_id);
  let q = db
    .from("services")
    .select("*")
    .eq("property_id", c.get("user").property_id)
    .order("sort_order")
    .order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

services.post("/catalog", requireRole("admin", "manager"), async (c) => {
  const parsed = await parseBody(c, serviceCreateSchema);
  if (!parsed.ok) return parsed.response;
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("services")
    .insert({ ...parsed.data, property_id: c.get("user").property_id })
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

services.put("/catalog/:id", requireRole("admin", "manager"), async (c) => {
  const parsed = await parseBody(c, serviceUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("services")
    .update(parsed.data)
    .eq("id", c.req.param("id") ?? "")
    .eq("property_id", c.get("user").property_id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

services.delete("/catalog/:id", requireRole("admin", "manager"), async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const id = c.req.param("id") ?? "";
  // Soft-delete to keep folio history intact (reservation_services.service_id FK).
  const { error } = await db
    .from("services")
    .update({ is_active: false })
    .eq("id", id)
    .eq("property_id", c.get("user").property_id);
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data: { id } });
});

// ── Folio charges (service charged to a reservation) ─
services.get("/", async (c) => {
  const reservationId = c.req.query("reservation_id");
  if (!reservationId) {
    return c.json({ success: false, error: "reservation_id required" }, 400);
  }
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("reservation_services")
    .select("*")
    .eq("property_id", c.get("user").property_id)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false });
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

services.post("/", async (c) => {
  const parsed = await parseBody(c, serviceChargeSchema);
  if (!parsed.ok) return parsed.response;
  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");

  // The reservation must belong to the caller's property.
  const { data: reservation } = await db
    .from("reservations")
    .select("id")
    .eq("id", parsed.data.reservation_id)
    .eq("property_id", user.property_id)
    .maybeSingle();
  if (!reservation) {
    return c.json({ success: false, error: "Reservation not found" }, 404);
  }

  const { quantity, unit_price } = parsed.data;
  const insert = {
    reservation_id: parsed.data.reservation_id,
    service_id: parsed.data.service_id ?? null,
    name: parsed.data.name,
    unit_price,
    quantity,
    amount: unit_price * quantity,
    note: parsed.data.note ?? null,
    charged_by: user?.sub ?? null,
    property_id: user.property_id,
  };
  const { data, error } = await db.from("reservation_services").insert(insert).select().single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

services.delete("/:id", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const id = c.req.param("id") ?? "";
  const { error } = await db
    .from("reservation_services")
    .delete()
    .eq("id", id)
    .eq("property_id", c.get("user").property_id);
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data: { id } });
});

export default services;
