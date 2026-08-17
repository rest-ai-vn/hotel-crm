import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import {
  guestCreateSchema,
  guestFindOrCreateSchema,
  guestUpdateSchema,
} from "../lib/schemas";

const guests = new Hono();

guests.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const search = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);

  let query = db
    .from("guests")
    .select("*", { count: "exact" })
    .eq("property_id", c.get("user").property_id);
  if (search) {
    const safe = search.replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,zalo_id.eq.${safe}`);
  }

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data, meta: { total: count, limit, offset } });
});

guests.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("guests")
    .select("*")
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .maybeSingle();

  if (error) return c.json({ success: false, error: error.message }, 500);
  if (!data) return c.json({ success: false, error: "Guest not found" }, 404);
  return c.json({ success: true, data });
});

guests.post("/", async (c) => {
  const parsed = await parseBody(c, guestCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("guests")
    .insert({ ...parsed.data, property_id: c.get("user").property_id })
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

guests.put("/:id", async (c) => {
  const parsed = await parseBody(c, guestUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("guests")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

guests.post("/find-or-create", async (c) => {
  const parsed = await parseBody(c, guestFindOrCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { phone, zalo_id, facebook_id, name } = parsed.data;
  const db = await getTenantDb(c.get("user").property_id);
  const pid = c.get("user").property_id;

  if (zalo_id) {
    const { data } = await db
      .from("guests")
      .select("*")
      .eq("property_id", pid)
      .eq("zalo_id", zalo_id)
      .maybeSingle();
    if (data) return c.json({ success: true, data, created: false });
  }
  if (facebook_id) {
    const { data } = await db
      .from("guests")
      .select("*")
      .eq("property_id", pid)
      .eq("facebook_id", facebook_id)
      .maybeSingle();
    if (data) return c.json({ success: true, data, created: false });
  }
  if (phone) {
    const { data } = await db
      .from("guests")
      .select("*")
      .eq("property_id", pid)
      .eq("phone", phone)
      .maybeSingle();
    if (data) {
      const patch: Record<string, string> = {};
      if (zalo_id && !data.zalo_id) patch.zalo_id = zalo_id;
      if (facebook_id && !data.facebook_id) patch.facebook_id = facebook_id;
      if (Object.keys(patch).length > 0) {
        await db.from("guests").update(patch).eq("id", data.id);
      }
      return c.json({ success: true, data: { ...data, ...patch }, created: false });
    }
  }

  const { data, error } = await db
    .from("guests")
    .insert({ name: name || "Khách", phone, zalo_id, facebook_id, property_id: pid })
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data, created: true }, 201);
});

export default guests;
