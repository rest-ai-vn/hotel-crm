import { Hono } from "hono";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { voucherCreateSchema, voucherUpdateSchema } from "../lib/schemas";
import { logAudit } from "../lib/audit";

const vouchers = new Hono();

vouchers.get("/", async (c) => {
  const db = await getTenantDb(c.get("user").property_id);
  const { data, error } = await db
    .from("vouchers")
    .select("*")
    .eq("property_id", c.get("user").property_id)
    .order("created_at", { ascending: false });
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

vouchers.post("/", async (c) => {
  const parsed = await parseBody(c, voucherCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");
  const { data, error } = await db
    .from("vouchers")
    .insert({
      ...parsed.data,
      code: parsed.data.code.trim().toUpperCase(),
      property_id: user.property_id,
    })
    .select()
    .single();
  if (error) {
    const isDup = error.code === "23505";
    return c.json(
      { success: false, error: isDup ? "Mã này đã tồn tại" : error.message },
      400,
    );
  }

  await logAudit(db, user, "voucher.create", "voucher", data.id, {
    code: data.code,
    kind: data.kind,
    value: data.value,
  });
  return c.json({ success: true, data }, 201);
});

vouchers.put("/:id", async (c) => {
  const parsed = await parseBody(c, voucherUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id") ?? "";
  const db = await getTenantDb(c.get("user").property_id);
  const user = c.get("user");
  const { data, error } = await db
    .from("vouchers")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", user.property_id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "voucher.update", "voucher", id, parsed.data);
  return c.json({ success: true, data });
});

export default vouchers;
