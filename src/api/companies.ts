import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { companyCreateSchema, companyUpdateSchema } from "../lib/schemas";
import { requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const companies = new Hono();

companies.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const includeInactive = c.req.query("all") === "1";
  let q = db
    .from("companies")
    .select("*")
    .eq("property_id", c.get("user").property_id)
    .order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

companies.post("/", requireRole("admin", "manager"), async (c) => {
  const parsed = await parseBody(c, companyCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");
  const { data, error } = await db
    .from("companies")
    .insert({ ...parsed.data, property_id: user.property_id })
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "company.create", "company", data.id, { name: data.name });
  return c.json({ success: true, data }, 201);
});

companies.put("/:id", requireRole("admin", "manager"), async (c) => {
  const parsed = await parseBody(c, companyUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id") ?? "";
  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");
  const { data, error } = await db
    .from("companies")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", user.property_id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "company.update", "company", id, parsed.data);
  return c.json({ success: true, data });
});

export default companies;
