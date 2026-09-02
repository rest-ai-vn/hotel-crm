// Xác thực API key cho các endpoint AI (/api/ai/*).
//
// Key được tra bằng service-role client vì chưa biết tenant cho đến khi giải mã
// được key — giống luồng đăng nhập nhân viên. Sau khi biết property_id, mọi truy
// vấn dữ liệu phải dùng getTenantDb() để RLS tiếp tục cách ly tenant.
import type { Context, Next } from "hono";
import { getServerDb } from "../db/supabase-client";
import { hashApiKey, hasScope, isApiKeyFormat, type ApiScope } from "../lib/api-key";
import { createRateLimiter } from "../lib/rate-limit";

export interface ApiKeyContext {
  id: string;
  property_id: string;
  name: string;
  scopes: string[];
}

declare module "hono" {
  interface ContextVariableMap {
    apiKey: ApiKeyContext;
  }
}

// 600 lượt / phút cho mỗi key — thoải mái cho chatbot, vẫn chặn vòng lặp hỏng.
const keyLimiter = createRateLimiter({ windowMs: 60_000, max: 600 });
// Key sai: 30 lần / 15 phút cho mỗi IP, chặn dò key.
const badKeyLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30 });

const TOUCH_INTERVAL_MS = 60_000;
const lastTouched = new Map<string, number>();

function presentedKey(c: Context): string | null {
  const header = c.req.header("x-api-key");
  if (header?.trim()) return header.trim();
  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  return bearer && isApiKeyFormat(bearer) ? bearer : null;
}

function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

/** Ghi nhận lần dùng gần nhất, tối đa 1 lần/phút mỗi key (fire-and-forget). */
function touch(id: string): void {
  const now = Date.now();
  if (now - (lastTouched.get(id) ?? 0) < TOUCH_INTERVAL_MS) return;
  lastTouched.set(id, now);
  void getServerDb()
    .from("api_keys")
    .update({ last_used_at: new Date(now).toISOString() })
    .eq("id", id)
    .then(
      () => undefined,
      () => undefined,
    );
}

export function requireApiKey(...required: ApiScope[]) {
  return async (c: Context, next: Next) => {
    const raw = presentedKey(c);
    if (!raw) {
      return c.json(
        { success: false, error: "Thiếu API key (header X-API-Key)", code: "missing_api_key" },
        401,
      );
    }

    const ip = clientIp(c);
    if (!badKeyLimiter.isAllowed(ip)) {
      return c.json(
        { success: false, error: "Quá nhiều key sai, thử lại sau", code: "rate_limited" },
        429,
      );
    }

    const { data: key } = await getServerDb()
      .from("api_keys")
      .select("id, property_id, name, scopes, is_active, expires_at")
      .eq("key_hash", hashApiKey(raw))
      .maybeSingle();

    if (!key || !key.is_active) {
      badKeyLimiter.hit(ip);
      return c.json(
        { success: false, error: "API key không hợp lệ", code: "invalid_api_key" },
        401,
      );
    }
    if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
      return c.json({ success: false, error: "API key đã hết hạn", code: "expired_api_key" }, 401);
    }

    const scopes: string[] = key.scopes ?? [];
    const missing = required.find((scope) => !hasScope(scopes, scope));
    if (missing) {
      return c.json(
        {
          success: false,
          error: `API key thiếu quyền "${missing}"`,
          code: "insufficient_scope",
        },
        403,
      );
    }

    if (!keyLimiter.isAllowed(key.id)) {
      return c.json(
        { success: false, error: "Vượt giới hạn gọi API, thử lại sau", code: "rate_limited" },
        429,
      );
    }
    keyLimiter.hit(key.id);
    touch(key.id);

    c.set("apiKey", {
      id: key.id,
      property_id: key.property_id,
      name: key.name,
      scopes,
    });
    await next();
  };
}
