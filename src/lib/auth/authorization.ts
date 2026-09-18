import type { MarinaRole } from "@/types/auth";

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
