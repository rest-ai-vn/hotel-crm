import { Hono } from "hono";
import { z } from "zod";
import { getServerDb } from "../db/supabase-client";
import { signStaffToken, verifyStaffToken } from "../lib/jwt";
import { requireAuth, requireRole } from "../middleware/auth";

const auth = new Hono();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
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

  const { data: staff } = await db
    .from("staff")
    .select("*, properties(name, code)")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (!staff) {
    return c.json({ success: false, error: "Email hoặc mật khẩu không đúng" }, 401);
  }

  const valid = await Bun.password.verify(password, staff.password_hash);
  if (!valid) {
    return c.json({ success: false, error: "Email hoặc mật khẩu không đúng" }, 401);
  }

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
  return c.json({ success: true, data }, 201);
});

export default auth;
