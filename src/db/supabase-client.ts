import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:8000";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// Server-side client (service role) — bypasses RLS, used by API routes + chatbot
let serverClient: SupabaseClient | null = null;

export function getServerDb(): SupabaseClient {
  if (!serverClient) {
    serverClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serverClient;
}

// Client-side anon key — for React frontend, respects RLS
export function getAnonConfig() {
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}
