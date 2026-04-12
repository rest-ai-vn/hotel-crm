import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";

const auth = new Hono();

// Login
auth.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  const db = getServerDb();

  const { data: staff } = await db
    .from("staff")
    .select("*")
    .eq("email", email)
    .eq("is_active", true)
    .single();

  if (!staff) return c.json({ success: false, error: "Email không tồn tại" }, 401);

  const valid = await Bun.password.verify(password, staff.password_hash);
  if (!valid) return c.json({ success: false, error: "Sai mật khẩu" }, 401);

  // Generate JWT
  const token = await new Response(
    new Blob([JSON.stringify({ id: staff.id, email: staff.email, role: staff.role, name: staff.name })])
  ).text();

  const jwt = btoa(JSON.stringify({ id: staff.id, role: staff.role, exp: Date.now() + 24 * 60 * 60 * 1000 }));

  return c.json({
    success: true,
    data: { token: jwt, user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role } },
  });
});

// Get current user from token
auth.get("/me", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ success: false, error: "Unauthorized" }, 401);

  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Date.now()) return c.json({ success: false, error: "Token expired" }, 401);

    const db = getServerDb();
    const { data: staff } = await db
      .from("staff")
      .select("id, name, email, role, is_active")
      .eq("id", payload.id)
      .eq("is_active", true)
      .single();

    if (!staff) return c.json({ success: false, error: "User not found" }, 401);
    return c.json({ success: true, data: staff });
  } catch {
    return c.json({ success: false, error: "Invalid token" }, 401);
  }
});

// Create staff (admin only)
auth.post("/staff", async (c) => {
  const { email, password, name, role } = await c.req.json();
  const db = getServerDb();

  const passwordHash = await Bun.password.hash(password);
  const { data, error } = await db
    .from("staff")
    .insert({ email, password_hash: passwordHash, name, role: role || "receptionist" })
    .select("id, name, email, role")
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

export default auth;
