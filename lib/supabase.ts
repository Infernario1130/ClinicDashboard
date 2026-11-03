import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server only. The service-role key bypasses row-level security, so this file
// must never be imported from a "use client" component. Created lazily so a
// build without env vars doesn't fail.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
