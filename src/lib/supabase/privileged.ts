import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/database";

function getSupabaseSecretEnv() {
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not configured.");

  const { url } = getSupabaseEnv();
  return { url, secretKey };
}

/**
 * Privileged server client. Callers must resolve and enforce tenant scope
 * before reading data because secret keys bypass row-level security.
 */
export function createPrivilegedClient() {
  const { url, secretKey } = getSupabaseSecretEnv();

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
