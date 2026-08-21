export const MARINA_ROLES = ["marina_admin", "marina_staff"] as const;

export type MarinaRole = (typeof MARINA_ROLES)[number];
export type MembershipStatus = "active" | "suspended";

export interface AuthorizationContext {
  userId: string;
  email: string | null;
  role: MarinaRole;
  organizationId: string;
  organizationName: string;
  marinaId: string;
  marinaName: string;
  marinaSlug: string;
  timezone: string;
}
