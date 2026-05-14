import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton browser client (read + realtime via RLS)
let _browser: SupabaseClient | null = null;
export function getBrowserClient(): SupabaseClient {
  if (_browser) return _browser;
  _browser = createClient(url, anon, {
    realtime: { params: { eventsPerSecond: 20 } },
    auth: { persistSession: false },
  });
  return _browser;
}

// Server-side admin client (service_role) — NEVER expose to browser.
export function getServiceClient(): SupabaseClient {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, service, { auth: { persistSession: false } });
}
