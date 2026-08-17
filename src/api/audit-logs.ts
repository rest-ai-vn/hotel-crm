import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";

const auditLogs = new Hono();

auditLogs.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const entity = c.req.query("entity");
  const action = c.req.query("action");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = Math.min(Number(c.req.query("limit") || 100), 500);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);

  let q = db
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("property_id", c.get("user").property_id);
  if (entity) q = q.eq("entity", entity);
  if (action) q = q.eq("action", action);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("created_at", `${from}T00:00:00`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("created_at", `${to}T23:59:59.999`);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data, meta: { total: count, limit, offset } });
});

export default auditLogs;
