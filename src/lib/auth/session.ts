import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { resolveAuthorizationForUser } from "@/lib/auth/authorization-tenant";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizationContext } from "@/types/auth";
import { needsAdminMfa } from "@/lib/auth/mfa-policy";

export async function getAuthorizationContext(options: { allowUnverifiedAdmin?: boolean } = {}): Promise<AuthorizationContext | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (error || !userId) return null;

  const email = typeof claims?.email === "string" ? claims.email : null;
  const context = await resolveAuthorizationForUser(supabase, userId, email);
  if (context && !options.allowUnverifiedAdmin && needsAdminMfa(context.role, claims?.aal)) return null;
  return context;
}

export async function requireMarinaMembership(pathname: string) {
  const context = await getAuthorizationContext({ allowUnverifiedAdmin: true });
  if (!context) redirect(`/login?next=${encodeURIComponent(pathname)}`);
  if (needsAdminMfa(context.role, (await (await createClient()).auth.getClaims()).data?.claims?.aal)) {
    redirect(`/mfa?next=${encodeURIComponent(pathname)}`);
  }
  return context;
}
