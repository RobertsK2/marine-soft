import { Suspense, type ReactNode } from "react";
import { AdminFrame } from "@/components/admin-sidebar";
import { InitialLoading } from "@/components/loading/initial-loading";
import { getAuthorizationContext } from "@/lib/auth/session";

async function DashboardShell({ children }: { children: ReactNode }) {
  // Navigation identity only. Each page retains its own authorization and redirects.
  const context = await getAuthorizationContext();
  return <AdminFrame context={context ? { email: context.email, role: context.role, marinaName: context.marinaName, organizationName: context.organizationName } : null}>{children}</AdminFrame>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<InitialLoading />}><DashboardShell>{children}</DashboardShell></Suspense>;
}
