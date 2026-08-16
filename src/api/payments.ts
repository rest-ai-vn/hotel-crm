import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { paymentCreateSchema } from "../lib/schemas";
import { requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { buildVietQrUrl } from "../lib/billing";
import { computeRemaining, type FolioPayment } from "../lib/folio";

const payments = new Hono();

// Dynamic VietQR for the remaining folio balance of a reservation.
payments.get("/vietqr", async (c) => {
  const reservationId = c.req.query("reservation_id");
  if (!reservationId) {
    return c.json({ success: false, error: "reservation_id required" }, 400);
  }
  const db = getServerDb();
  const user = c.get("user");

  const [resRes, paysRes, propRes] = await Promise.all([
    db
      .from("reservations")
      .select("confirmation_code, total_amount, services_total")
      .eq("id", reservationId)
      .eq("property_id", user.property_id)
      .maybeSingle(),
    db.from("payments").select("amount, kind").eq("reservation_id", reservationId),
    db
      .from("properties")
      .select("bank_id, bank_account_no, bank_account_name")
      .eq("id", user.property_id)
      .maybeSingle(),
  ]);

  if (!resRes.data) return c.json({ success: false, error: "Reservation not found" }, 404);
  const prop = propRes.data;
  if (!prop?.bank_id || !prop?.bank_account_no) {
    return c.json(
      { success: false, error: "Chưa cấu hình tài khoản ngân hàng cho cơ sở (trang Cơ sở)" },
      400,
    );
  }

  const folioTotal =
    (resRes.data.total_amount ?? 0) + (resRes.data.services_total ?? 0);
  const remaining = computeRemaining(folioTotal, (paysRes.data ?? []) as FolioPayment[]);
  if (remaining <= 0) {
    return c.json({ success: false, error: "Đặt phòng này đã thanh toán đủ" }, 400);
  }

  const url = buildVietQrUrl({
    bankId: prop.bank_id,
    accountNo: prop.bank_account_no,
    accountName: prop.bank_account_name ?? "",
    amount: remaining,
    memo: resRes.data.confirmation_code,
  });
  return c.json({ success: true, data: { url, amount: remaining } });
});

payments.get("/", async (c) => {
  const reservationId = c.req.query("reservation_id");
  if (!reservationId) {
    return c.json({ success: false, error: "reservation_id required" }, 400);
  }

  const db = getServerDb();
  const { data, error } = await db
    .from("payments")
    .select("*")
    .eq("property_id", c.get("user").property_id)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false });

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

payments.post("/", async (c) => {
  const parsed = await parseBody(c, paymentCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
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

  const insert = {
    ...parsed.data,
    received_by: user?.sub ?? null,
    property_id: user.property_id,
  };

  const { data, error } = await db.from("payments").insert(insert).select().single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, `payment.${parsed.data.kind}`, "payment", data.id, {
    reservation_id: parsed.data.reservation_id,
    amount: parsed.data.amount,
    method: parsed.data.method,
  });
  return c.json({ success: true, data }, 201);
});

// Deleting a payment erases money history — manager/admin only, always audited.
payments.delete("/:id", requireRole("admin", "manager"), async (c) => {
  const id = c.req.param("id") ?? "";
  const db = getServerDb();
  const user = c.get("user");

  const { data: existing } = await db
    .from("payments")
    .select("reservation_id, amount, method, kind")
    .eq("id", id)
    .eq("property_id", user.property_id)
    .maybeSingle();
  if (!existing) return c.json({ success: false, error: "Payment not found" }, 404);

  const { error } = await db
    .from("payments")
    .delete()
    .eq("id", id)
    .eq("property_id", user.property_id);
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "payment.delete", "payment", id, existing ?? undefined);
  return c.json({ success: true, data: { id } });
});

export default payments;
