import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMarinaRole } from "@/lib/auth/authorization";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import type { AuthorizationContext } from "@/types/auth";
import type { Database } from "@/types/database";

export async function resolveAuthorizationForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null,
): Promise<AuthorizationContext | null> {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error("Unable to resolve marina membership.", { cause: membershipError });
  }
  if (!membership || !isMarinaRole(membership.role)) return null;

  // AAL1 admins may read their own membership only. Resolve tenant labels on
  // the server, scoped by that verified membership, to present the MFA screen.
  const tenantLookup = createPrivilegedClient();
  const [{ data: organization, error: organizationError }, { data: marina, error: marinaError }] =
    await Promise.all([
      tenantLookup.from("organizations").select("id, name")
        .eq("id", membership.organization_id).maybeSingle(),
      tenantLookup.from("marinas").select("id, name, slug, timezone")
        .eq("organization_id", membership.organization_id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);

  if (organizationError || marinaError) {
    throw new Error("Unable to resolve marina tenant.", { cause: organizationError ?? marinaError });
  }
  if (!organization || !marina) return null;

  return {
    userId, email, role: membership.role,
    organizationId: organization.id, organizationName: organization.name,
    marinaId: marina.id, marinaName: marina.name, marinaSlug: marina.slug,
    timezone: marina.timezone,
  };
}
