import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * A cookie-free client for deliberately public reads. Keeping this separate
 * prevents a visitor's marina-admin session from widening the public query.
 */
export function createPublicClient() {
  const { url, publishableKey } = getSupabaseEnv();

  return createSupabaseClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
