// Quản lý API key tích hợp AI của cơ sở (admin/manager). Bản rõ của key chỉ xuất
// hiện đúng một lần trong response tạo mới — sau đó DB chỉ còn prefix + bản băm.
import { Hono } from "hono";
import { z } from "zod";
import { getTenantDb } from "../db/tenant-db";
import { parseBody } from "../lib/validate";
import { logAudit } from "../lib/audit";
import { API_KEY_SCOPES, generateApiKey, parseScopes } from "../lib/api-key";

const aiIntegrations = new Hono();

// key_hash KHÔNG BAO GIỜ ra khỏi máy chủ.
const SAFE_COLUMNS =
  "id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).optional(),
  expires_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .nullable()
    .optional(),
});

const updateSchema = z.object({
  is_active: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
});

aiIntegrations.get("/", async (c) => {
  const user = c.get("user");
  const db = await getTenantDb(user.property_id);
  const { data, error } = await db
    .from("api_keys")
    .select(SAFE_COLUMNS)
    .eq("property_id", user.property_id)
    .order("created_at", { ascending: false });
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

aiIntegrations.post("/", async (c) => {
  const parsed = await parseBody(c, createSchema);
  if (!parsed.ok) return parsed.response;

  const user = c.get("user");
  const db = await getTenantDb(user.property_id);
  const generated = generateApiKey();
  const scopes = parseScopes(parsed.data.scopes);

  const { data, error } = await db
    .from("api_keys")
    .insert({
      property_id: user.property_id,
      name: parsed.data.name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes,
      // Hết hạn vào cuối ngày được chọn.
      expires_at: parsed.data.expires_on ? `${parsed.data.expires_on}T23:59:59Z` : null,
      created_by: user.sub,
    })
    .select(SAFE_COLUMNS)
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "api_key.create", "api_key", data.id, {
    name: data.name,
    scopes,
    key_prefix: generated.prefix,
  });

  // `key` chỉ hiện một lần duy nhất — không lưu, không truy xuất lại được.
  return c.json({ success: true, data: { ...data, key: generated.key } }, 201);
});

aiIntegrations.put("/:id", async (c) => {
  const parsed = await parseBody(c, updateSchema);
  if (!parsed.ok) return parsed.response;
  if (Object.keys(parsed.data).length === 0) {
    return c.json({ success: false, error: "Không có gì để cập nhật" }, 400);
  }

  const id = c.req.param("id") ?? "";
  const user = c.get("user");
  const db = await getTenantDb(user.property_id);

  const { data, error } = await db
    .from("api_keys")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", user.property_id)
    .select(SAFE_COLUMNS)
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "api_key.update", "api_key", id, parsed.data);
  return c.json({ success: true, data });
});

aiIntegrations.delete("/:id", async (c) => {
  const id = c.req.param("id") ?? "";
  const user = c.get("user");
  const db = await getTenantDb(user.property_id);

  const { error } = await db
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("property_id", user.property_id);
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "api_key.delete", "api_key", id);
  return c.json({ success: true, data: { id } });
});

export default aiIntegrations;
