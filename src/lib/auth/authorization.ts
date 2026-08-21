import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthorizationContext, MarinaRole } from "@/types/auth";
import type { Database } from "@/types/database";

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string) {
  return matchesPrefix(pathname, "/dashboard");
}

export function isSafeDashboardPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(decodeURIComponent(value));
  } catch {
    return false;
  }

  if (
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(decoded)
  ) {
    return false;
  }

  const url = new URL(decoded, "https://berthio.invalid");
  return (
    url.origin === "https://berthio.invalid" &&
    matchesPrefix(url.pathname, "/dashboard")
  );
}

export function resolveDashboardDestination(next: string | null | undefined) {
  return isSafeDashboardPath(next) ? next! : "/dashboard";
}

export function resolveAuthCallbackDestination(next: string | null | undefined) {
  if (next === "/reset-password") return next;
  return resolveDashboardDestination(next);
}

export function isMarinaRole(value: unknown): value is MarinaRole {
  return value === "marina_admin" || value === "marina_staff";
}

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
    throw new Error("Unable to resolve marina membership.", {
      cause: membershipError,
    });
  }
  if (!membership || !isMarinaRole(membership.role)) return null;

  const [{ data: organization, error: organizationError }, { data: marina, error: marinaError }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name")
        .eq("id", membership.organization_id)
        .maybeSingle(),
      supabase
        .from("marinas")
        .select("id, name, slug, timezone")
        .eq("organization_id", membership.organization_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  if (organizationError || marinaError) {
    throw new Error("Unable to resolve marina tenant.", {
      cause: organizationError ?? marinaError,
    });
  }
  if (!organization || !marina) return null;

  return {
    userId,
    email,
    role: membership.role,
    organizationId: organization.id,
    organizationName: organization.name,
    marinaId: marina.id,
    marinaName: marina.name,
    marinaSlug: marina.slug,
    timezone: marina.timezone,
  };
}
