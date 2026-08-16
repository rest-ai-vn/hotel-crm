import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { shiftCloseSchema, shiftOpenSchema } from "../lib/schemas";
import { computeShiftCashSummary, type ShiftPayment } from "../lib/shifts";
import { logAudit } from "../lib/audit";

const shifts = new Hono();

interface CashTxnRow {
  direction: "income" | "expense";
  amount: number;
}

/** Payments + cashbook activity between a shift's open time and now/close. */
async function loadShiftActivity(propertyId: string, openedAt: string, until?: string) {
  const db = getServerDb();
  let paymentsQ = db
    .from("payments")
    .select("amount, method, kind, created_at")
    .eq("property_id", propertyId)
    .gte("created_at", openedAt);
  let cashQ = db
    .from("cash_transactions")
    .select("direction, amount, created_at")
    .eq("property_id", propertyId)
    .gte("created_at", openedAt);
  if (until) {
    paymentsQ = paymentsQ.lte("created_at", until);
    cashQ = cashQ.lte("created_at", until);
  }
  const [paymentsRes, cashRes] = await Promise.all([paymentsQ, cashQ]);
  const payments = (paymentsRes.data ?? []) as ShiftPayment[];
  const cashRows = (cashRes.data ?? []) as CashTxnRow[];
  let income = 0;
  let expense = 0;
  for (const r of cashRows) {
    if (r.direction === "income") income += r.amount ?? 0;
    else expense += r.amount ?? 0;
  }
  return { payments, cashbookIncome: income, cashbookExpense: expense };
}

shifts.get("/", async (c) => {
  const db = getServerDb();
  const limit = Math.min(Number(c.req.query("limit") || 30), 100);
  const { data, error } = await db
    .from("shifts")
    .select("*, staff(name)")
    .eq("property_id", c.get("user").property_id)
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

shifts.get("/current", async (c) => {
  const db = getServerDb();
  const pid = c.get("user").property_id;
  const { data: shift, error } = await db
    .from("shifts")
    .select("*, staff(name)")
    .eq("property_id", pid)
    .eq("status", "open")
    .maybeSingle();
  if (error) return c.json({ success: false, error: error.message }, 500);
  if (!shift) return c.json({ success: true, data: null });

  const activity = await loadShiftActivity(pid, shift.opened_at);
  const summary = computeShiftCashSummary({
    openingCash: shift.opening_cash ?? 0,
    payments: activity.payments,
    cashbookIncome: activity.cashbookIncome,
    cashbookExpense: activity.cashbookExpense,
  });
  return c.json({ success: true, data: { ...shift, summary } });
});

shifts.post("/open", async (c) => {
  const parsed = await parseBody(c, shiftOpenSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const user = c.get("user");
  const { data, error } = await db
    .from("shifts")
    .insert({
      staff_id: user.sub,
      opening_cash: parsed.data.opening_cash,
      note: parsed.data.note ?? null,
      property_id: user.property_id,
    })
    .select()
    .single();

  if (error) {
    const isDup = error.message.includes("idx_shifts_single_open") || error.code === "23505";
    return c.json(
      { success: false, error: isDup ? "Đang có ca chưa chốt. Hãy chốt ca hiện tại trước." : error.message },
      isDup ? 409 : 400,
    );
  }
  await logAudit(db, user, "shift.open", "shift", data.id, {
    opening_cash: parsed.data.opening_cash,
  });
  return c.json({ success: true, data }, 201);
});

shifts.post("/close", async (c) => {
  const parsed = await parseBody(c, shiftCloseSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const user = c.get("user");
  const { data: shift, error: findErr } = await db
    .from("shifts")
    .select("*")
    .eq("property_id", user.property_id)
    .eq("status", "open")
    .maybeSingle();
  if (findErr) return c.json({ success: false, error: findErr.message }, 500);
  if (!shift) return c.json({ success: false, error: "Không có ca nào đang mở" }, 404);

  const closedAt = new Date().toISOString();
  const activity = await loadShiftActivity(user.property_id, shift.opened_at, closedAt);
  const summary = computeShiftCashSummary({
    openingCash: shift.opening_cash ?? 0,
    payments: activity.payments,
    cashbookIncome: activity.cashbookIncome,
    cashbookExpense: activity.cashbookExpense,
  });
  const variance = parsed.data.counted_cash - summary.expected_cash;

  const { data, error } = await db
    .from("shifts")
    .update({
      status: "closed",
      closed_at: closedAt,
      expected_cash: summary.expected_cash,
      counted_cash: parsed.data.counted_cash,
      variance,
      note: parsed.data.note ?? shift.note,
    })
    .eq("id", shift.id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "shift.close", "shift", shift.id, {
    expected_cash: summary.expected_cash,
    counted_cash: parsed.data.counted_cash,
    variance,
  });
  return c.json({ success: true, data: { ...data, summary } });
});

export default shifts;
