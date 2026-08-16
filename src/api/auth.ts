import { Hono } from "hono";
import { z } from "zod";
import { getServerDb } from "../db/supabase-client";
import { signStaffToken, verifyStaffToken } from "../lib/jwt";
import { requireAuth, requireRole } from "../middleware/auth";
import { createRateLimiter } from "../lib/rate-limit";
import { logAudit } from "../lib/audit";

const auth = new Hono();

// Brute-force guard: 5 failed logins per IP+email in 15 minutes.
const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });

function clientKey(ipHeader: string | undefined, realIp: string | undefined, email: string): string {
  const ip = ipHeader?.split(",")[0]?.trim() || realIp || "unknown";
  return `${ip}:${email.toLowerCase()}`;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(8).max(200),
});

const staffUpdateSchema = z.object({
  role: z.enum(["admin", "manager", "receptionist", "housekeeping"]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200),
  role: z.enum(["admin", "manager", "receptionist", "housekeeping"]).optional(),
  property_id: z.string().uuid().optional(),
});

auth.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: "Invalid login payload" }, 400);
  }
  const { email, password } = parsed.data;
  const db = getServerDb();

  const key = clientKey(c.req.header("x-forwarded-for"), c.req.header("x-real-ip"), email);
  if (!loginLimiter.isAllowed(key)) {
    return c.json(
      { success: false, error: "Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút." },
      429,
    );
  }

  const { data: staff } = await db
    .from("staff")
    .select("*, properties(name, code)")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (!staff) {
    loginLimiter.hit(key);
    return c.json({ success: false, error: "Email hoặc mật khẩu không đúng" }, 401);
  }

  const valid = await Bun.password.verify(password, staff.password_hash);
  if (!valid) {
    loginLimiter.hit(key);
    return c.json({ success: false, error: "Email hoặc mật khẩu không đúng" }, 401);
  }
  loginLimiter.reset(key);

  const token = await signStaffToken({
    sub: staff.id,
    email: staff.email,
    role: staff.role,
    name: staff.name,
    property_id: staff.property_id,
  });

  return c.json({
    success: true,
    data: {
      token,
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        property_id: staff.property_id,
        property_name: staff.properties?.name ?? null,
      },
    },
  });
});

auth.get("/me", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ success: false, error: "Unauthorized" }, 401);

  try {
    const payload = await verifyStaffToken(token);
    const db = getServerDb();
    const { data: staff } = await db
      .from("staff")
      .select("id, name, email, role, is_active, property_id, properties(name, code)")
      .eq("id", payload.sub)
      .eq("is_active", true)
      .maybeSingle();

    if (!staff) return c.json({ success: false, error: "User not found" }, 401);
    const { properties, ...rest } = staff as typeof staff & {
      properties: { name: string; code: string } | null;
    };
    return c.json({
      success: true,
      data: { ...rest, property_name: properties?.name ?? null },
    });
  } catch {
    return c.json({ success: false, error: "Invalid or expired token" }, 401);
  }
});

auth.post("/staff", requireAuth, requireRole("admin"), async (c) => {
  const parsed = createStaffSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }
  const { email, password, name, role, property_id } = parsed.data;
  const db = getServerDb();
  const user = c.get("user");

  const passwordHash = await Bun.password.hash(password);
  const { data, error } = await db
    .from("staff")
    .insert({
      email,
      password_hash: passwordHash,
      name,
      role: role ?? "receptionist",
      // Admin may create staff for another property; defaults to their own.
      property_id: property_id ?? user.property_id,
    })
    .select("id, name, email, role, property_id")
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  await logAudit(db, user, "staff.create", "staff", data.id, {
    email: data.email,
    role: data.role,
    property_id: data.property_id,
  });
  return c.json({ success: true, data }, 201);
});

// Self-service password change (any authenticated staff).
auth.post("/change-password", requireAuth, async (c) => {
  const parsed = changePasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: "Mật khẩu mới tối thiểu 8 ký tự" }, 400);
  }
  const user = c.get("user");
  const db = getServerDb();

  const { data: staff } = await db
    .from("staff")
    .select("id, password_hash")
    .eq("id", user.sub)
    .eq("is_active", true)
    .maybeSingle();
  if (!staff) return c.json({ success: false, error: "Không tìm thấy tài khoản" }, 404);

  const valid = await Bun.password.verify(parsed.data.current_password, staff.password_hash);
  if (!valid) {
    return c.json({ success: false, error: "Mật khẩu hiện tại không đúng" }, 401);
  }

  const password_hash = await Bun.password.hash(parsed.data.new_password);
  const { error } = await db.from("staff").update({ password_hash }).eq("id", user.sub);
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "staff.change_password", "staff", user.sub);
  return c.json({ success: true, data: { id: user.sub } });
});

// Staff administration (admin only).
auth.get("/staff", requireAuth, requireRole("admin"), async (c) => {
  const db = getServerDb();
  const user = c.get("user");
  const propertyId = c.req.query("property_id") || user.property_id;

  const { data, error } = await db
    .from("staff")
    .select("id, name, email, role, is_active, property_id, properties(name)")
    .eq("property_id", propertyId)
    .order("name");
  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

auth.put("/staff/:id", requireAuth, requireRole("admin"), async (c) => {
  const parsed = staffUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }
  const id = c.req.param("id") ?? "";
  const user = c.get("user");
  const db = getServerDb();

  if (id === user.sub && parsed.data.is_active === false) {
    return c.json({ success: false, error: "Không thể tự khóa tài khoản của mình" }, 400);
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  if (parsed.data.password) {
    update.password_hash = await Bun.password.hash(parsed.data.password);
  }
  if (Object.keys(update).length === 0) {
    return c.json({ success: false, error: "Không có gì để cập nhật" }, 400);
  }

  const { data, error } = await db
    .from("staff")
    .update(update)
    .eq("id", id)
    .select("id, name, email, role, is_active, property_id")
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, user, "staff.update", "staff", id, {
    role: parsed.data.role,
    is_active: parsed.data.is_active,
    password_reset: !!parsed.data.password,
  });
  return c.json({ success: true, data });
});

export default auth;
