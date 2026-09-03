import { Hono } from "hono";
import { z } from "zod";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { logAudit } from "../lib/audit";
import { EncryptionKeyMissing, encryptSecret } from "../lib/crypto";

const properties = new Hono();

const propertyCreateSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  vat_rate: z.number().int().min(0).max(50).optional(),
  bank_id: z.string().max(20).nullable().optional(),
  bank_account_no: z.string().max(30).nullable().optional(),
  bank_account_name: z.string().max(100).nullable().optional(),
  deposit_pct: z.number().int().min(0).max(100).optional(),
  einvoice_provider: z.enum(["viettel", "vnpt", "misa"]).nullable().optional(),
  einvoice_tax_code: z.string().max(20).nullable().optional(),
  einvoice_username: z.string().max(100).nullable().optional(),
  einvoice_password: z.string().max(200).nullable().optional(),
  einvoice_template: z.string().max(20).nullable().optional(),
  einvoice_serial: z.string().max(20).nullable().optional(),
});
const propertyUpdateSchema = propertyCreateSchema.partial().extend({
  is_active: z.boolean().optional(),
});

// einvoice_password KHÔNG BAO GIỜ trả ra API (chỉ ghi, không đọc) — nó là khóa
// API của nhà cung cấp HĐĐT. Mọi response dùng danh sách cột tường minh này.
const SAFE_COLUMNS =
  "id, name, code, address, phone, is_active, created_at, vat_rate, bank_id, bank_account_no, bank_account_name, deposit_pct, einvoice_provider, einvoice_tax_code, einvoice_username, einvoice_template, einvoice_serial";

/**
 * Mật khẩu API hóa đơn của cơ sở KHÔNG BAO GIỜ được ghi thẳng xuống CSDL — nó là
 * khóa phát hành hóa đơn dưới danh nghĩa công ty khách hàng. Thiếu khóa mã hóa
 * thì từ chối lưu, chứ không âm thầm ghi plaintext.
 */
function withEncryptedSecrets<T extends { einvoice_password?: string | null }>(
  data: T,
): { ok: true; data: T } | { ok: false; error: string } {
  if (data.einvoice_password === undefined || data.einvoice_password === null) {
    return { ok: true, data };
  }
  try {
    return { ok: true, data: { ...data, einvoice_password: encryptSecret(data.einvoice_password) } };
  } catch (e) {
    if (e instanceof EncryptionKeyMissing) return { ok: false, error: e.message };
    throw e;
  }
}

properties.get("/", async (c) => {
  const db = getServerDb();
  const user = c.get("user");
  let query = db.from("properties").select(SAFE_COLUMNS).order("created_at", { ascending: true });
  // Chỉ admin thấy toàn chuỗi; manager chỉ thấy cơ sở của mình.
  if (user.role !== "admin") query = query.eq("id", user.property_id);
  const { data, error } = await query;
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

properties.post("/", async (c) => {
  const parsed = await parseBody(c, propertyCreateSchema);
  if (!parsed.ok) return parsed.response;

  const secured = withEncryptedSecrets(parsed.data);
  if (!secured.ok) return c.json({ success: false, error: secured.error }, 500);

  const db = getServerDb();
  const user = c.get("user");
  const { data, error } = await db
    .from("properties")
    .insert(secured.data)
    .select(SAFE_COLUMNS)
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "property.create", "property", data.id, {
    name: data.name,
    code: data.code,
  });
  return c.json({ success: true, data }, 201);
});

properties.put("/:id", async (c) => {
  const parsed = await parseBody(c, propertyUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id") ?? "";
  const user = c.get("user");
  // Manager chỉ được sửa cơ sở của chính mình; admin sửa được mọi cơ sở.
  if (user.role !== "admin" && id !== user.property_id) {
    return c.json({ success: false, error: "Không có quyền sửa cơ sở này" }, 403);
  }

  const secured = withEncryptedSecrets(parsed.data);
  if (!secured.ok) return c.json({ success: false, error: secured.error }, 500);

  const db = getServerDb();
  const { data, error } = await db
    .from("properties")
    .update(secured.data)
    .eq("id", id)
    .select(SAFE_COLUMNS)
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  // Không ghi giá trị mật khẩu HĐĐT vào nhật ký — chỉ ghi nhận là có đổi.
  const { einvoice_password, ...auditable } = parsed.data;
  await logAudit(db, user, "property.update", "property", id, {
    ...auditable,
    ...(einvoice_password !== undefined ? { einvoice_password: "[đã đổi]" } : {}),
  });
  return c.json({ success: true, data });
});

export default properties;
