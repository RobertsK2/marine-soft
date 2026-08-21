import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { resolveAuthorizationForUser } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizationContext } from "@/types/auth";

export async function getAuthorizationContext(): Promise<AuthorizationContext | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (error || !userId) return null;

  const email = typeof claims?.email === "string" ? claims.email : null;
  return resolveAuthorizationForUser(supabase, userId, email);
}

export async function requireMarinaMembership(pathname: string) {
  const context = await getAuthorizationContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(pathname)}`);
  return context;
}
