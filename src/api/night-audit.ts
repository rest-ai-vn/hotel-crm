import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { nightAuditRunSchema } from "../lib/schemas";
import { logAudit } from "../lib/audit";

const nightAudit = new Hono();

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface PaymentRow {
  amount: number;
  kind: "payment" | "deposit" | "refund";
}

/** Day stats + no-show candidates for a business date. */
async function buildDaySnapshot(propertyId: string, businessDate: string) {
  const db = getServerDb();
  const [candidatesRes, arrivalsRes, departuresRes, inHouseRes, paymentsRes, cashRes] =
    await Promise.all([
      // No-show candidates: still 'confirmed' but check_in already passed.
      db
        .from("reservations")
        .select("id, confirmation_code, check_in, total_amount, guests(name, phone), room_types(name)")
        .eq("property_id", propertyId)
        .eq("status", "confirmed")
        .lt("check_in", businessDate),
      db
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .eq("check_in", businessDate)
        .in("status", ["checked_in", "checked_out"]),
      db
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .eq("check_out", businessDate)
        .eq("status", "checked_out"),
      db
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId)
        .eq("status", "checked_in"),
      db
        .from("payments")
        .select("amount, kind")
        .eq("property_id", propertyId)
        .gte("created_at", `${businessDate}T00:00:00`)
        .lte("created_at", `${businessDate}T23:59:59.999`),
      db
        .from("cash_transactions")
        .select("direction, amount")
        .eq("property_id", propertyId)
        .eq("occurred_on", businessDate),
    ]);

  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  let collected = 0;
  let refunded = 0;
  for (const p of payments) {
    if (p.kind === "refund") refunded += p.amount ?? 0;
    else collected += p.amount ?? 0;
  }
  const cashRows = (cashRes.data ?? []) as Array<{ direction: string; amount: number }>;
  let cashIncome = 0;
  let cashExpense = 0;
  for (const r of cashRows) {
    if (r.direction === "income") cashIncome += r.amount ?? 0;
    else cashExpense += r.amount ?? 0;
  }

  return {
    candidates: candidatesRes.data ?? [],
    stats: {
      arrivals: arrivalsRes.count ?? 0,
      departures: departuresRes.count ?? 0,
      in_house: inHouseRes.count ?? 0,
      payments_collected: collected,
      payments_refunded: refunded,
      cashbook_income: cashIncome,
      cashbook_expense: cashExpense,
    },
  };
}

nightAudit.get("/", async (c) => {
  const db = getServerDb();
  const limit = Math.min(Number(c.req.query("limit") || 30), 100);
  const { data, error } = await db
    .from("night_audits")
    .select("*, staff:closed_by(name)")
    .eq("property_id", c.get("user").property_id)
    .order("business_date", { ascending: false })
    .limit(limit);
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

nightAudit.get("/preview", async (c) => {
  const date = c.req.query("date") || todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ success: false, error: "date must be YYYY-MM-DD" }, 400);
  }
  const db = getServerDb();
  const pid = c.get("user").property_id;
  const { data: existing } = await db
    .from("night_audits")
    .select("id, closed_at")
    .eq("property_id", pid)
    .eq("business_date", date)
    .maybeSingle();

  const snapshot = await buildDaySnapshot(pid, date);
  return c.json({
    success: true,
    data: {
      business_date: date,
      already_closed: !!existing,
      no_show_candidates: snapshot.candidates,
      stats: snapshot.stats,
    },
  });
});

nightAudit.post("/run", async (c) => {
  const parsed = await parseBody(c, nightAuditRunSchema);
  if (!parsed.ok) return parsed.response;

  const businessDate = parsed.data.business_date ?? todayIso();
  const db = getServerDb();
  const user = c.get("user");

  const { data: existing } = await db
    .from("night_audits")
    .select("id")
    .eq("property_id", user.property_id)
    .eq("business_date", businessDate)
    .maybeSingle();
  if (existing) {
    return c.json({ success: false, error: `Ngày ${businessDate} đã được chốt` }, 409);
  }

  const snapshot = await buildDaySnapshot(user.property_id, businessDate);
  const candidateIds = (snapshot.candidates as Array<{ id: string }>).map((r) => r.id);

  if (candidateIds.length > 0) {
    const { error: nsErr } = await db
      .from("reservations")
      .update({ status: "no_show" })
      .in("id", candidateIds)
      .eq("property_id", user.property_id)
      .eq("status", "confirmed");
    if (nsErr) return c.json({ success: false, error: nsErr.message }, 400);
  }

  const { data, error } = await db
    .from("night_audits")
    .insert({
      business_date: businessDate,
      closed_by: user.sub,
      no_show_count: candidateIds.length,
      stats: snapshot.stats,
      note: parsed.data.note ?? null,
      property_id: user.property_id,
    })
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "night_audit.run", "night_audit", data.id, {
    business_date: businessDate,
    no_show_count: candidateIds.length,
    no_show_ids: candidateIds,
  });
  return c.json({ success: true, data }, 201);
});

export default nightAudit;
