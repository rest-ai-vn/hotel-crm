import type { Context, Next } from "hono";
import { verifyStaffToken, type StaffTokenPayload } from "../lib/jwt";

export type StaffRole = "admin" | "manager" | "receptionist" | "housekeeping";

declare module "hono" {
  interface ContextVariableMap {
    user: StaffTokenPayload;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  try {
    const payload = await verifyStaffToken(token);
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ success: false, error: "Invalid or expired token" }, 401);
  }
}

export function requireRole(...allowed: StaffRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }
    if (!allowed.includes(user.role as StaffRole)) {
      return c.json({ success: false, error: "Forbidden" }, 403);
    }
    await next();
  };
}
