import type { MarinaRole } from "@/types/auth";

export function adminMfaRequired(environment: NodeJS.ProcessEnv) {
  return environment.NODE_ENV === "production" || environment.BERTHIO_REQUIRE_ADMIN_MFA === "true";
}

export function needsAdminMfa(role: MarinaRole, assuranceLevel: unknown, environment: NodeJS.ProcessEnv = process.env) {
  return role === "marina_admin" && adminMfaRequired(environment) && assuranceLevel !== "aal2";
}
