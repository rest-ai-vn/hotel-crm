// Tenant-scoped Supabase/PostgREST client. Each property gets a short-lived
// JWT with role `tenant_user` + `property_id` claim, so Postgres RLS enforces
// isolation even if a query forgets its .eq("property_id", ...) filter.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:8000";
const PGRST_JWT_SECRET = process.env.PGRST_JWT_SECRET || "";

const TOKEN_TTL_MS = 2 * 3600_000;
const cache = new Map<string, { client: SupabaseClient; expiresAt: number }>();

export async function getTenantDb(propertyId: string): Promise<SupabaseClient> {
  if (!PGRST_JWT_SECRET) {
    throw new Error("PGRST_JWT_SECRET not configured");
  }
  const hit = cache.get(propertyId);
  if (hit && hit.expiresAt - Date.now() > 60_000) return hit.client;

  const token = await new SignJWT({ role: "tenant_user", property_id: propertyId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(PGRST_JWT_SECRET));

  const client = createClient(SUPABASE_URL, token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  cache.set(propertyId, { client, expiresAt: Date.now() + TOKEN_TTL_MS });
  return client;
}
