import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { cashTxnCreateSchema } from "../lib/schemas";
import { requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const cashbook = new Hono();

interface CashRow {
  direction: "income" | "expense";
  amount: number;
}

cashbook.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const from = c.req.query("from");
  const to = c.req.query("to");
  const direction = c.req.query("direction");

  let q = db
    .from("cash_transactions")
    .select("*")
    .eq("property_id", c.get("user").property_id)
    .order("occurred_on", { ascending: false });
  if (from) q = q.gte("occurred_on", from);
  if (to) q = q.lte("occurred_on", to);
  if (direction === "income" || direction === "expense") q = q.eq("direction", direction);

  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

cashbook.get("/summary", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const from = c.req.query("from");
  const to = c.req.query("to");

  let q = db
    .from("cash_transactions")
    .select("direction, amount")
    .eq("property_id", c.get("user").property_id);
  if (from) q = q.gte("occurred_on", from);
  if (to) q = q.lte("occurred_on", to);

  const { data, error } = await q;
  if (error) return c.json({ success: false, error: error.message }, 500);

  const rows = (data ?? []) as CashRow[];
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.direction === "income") income += r.amount ?? 0;
    else expense += r.amount ?? 0;
  }
  return c.json({
    success: true,
    data: { income, expense, net: income - expense, count: rows.length },
  });
});

cashbook.post("/", async (c) => {
  const parsed = await parseBody(c, cashTxnCreateSchema);
  if (!parsed.ok) return parsed.response;
  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");
  const insert: Record<string, unknown> = {
    direction: parsed.data.direction,
    category: parsed.data.category,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    reservation_id: parsed.data.reservation_id ?? null,
    created_by: user?.sub ?? null,
    property_id: user.property_id,
  };
  // Only set occurred_on when provided; otherwise DB default current_date applies.
  if (parsed.data.occurred_on) insert.occurred_on = parsed.data.occurred_on;

  const { data, error } = await db.from("cash_transactions").insert(insert).select().single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

cashbook.delete("/:id", requireRole("admin", "manager"), async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const id = c.req.param("id") ?? "";
  const pid = c.get("user").property_id;
  const { data: existing } = await db
    .from("cash_transactions")
    .select("direction, category, amount, occurred_on")
    .eq("id", id)
    .eq("property_id", pid)
    .maybeSingle();
  if (!existing) return c.json({ success: false, error: "Không tìm thấy giao dịch" }, 404);

  const { error } = await db
    .from("cash_transactions")
    .delete()
    .eq("id", id)
    .eq("property_id", pid);
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, c.get("user"), "cash_transaction.delete", "cash_transaction", id, existing ?? undefined);
  return c.json({ success: true, data: { id } });
});

export default cashbook;
