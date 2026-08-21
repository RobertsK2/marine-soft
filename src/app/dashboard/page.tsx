import { AppShell } from "@/components/app-shell";
import { requireMarinaMembership } from "@/lib/auth/session";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const context = await requireMarinaMembership("/dashboard");

  return (
    <AppShell
      context={context}
      title="Marina dashboard"
      description="Authentication and tenant isolation are active. Berths and bookings are introduced in later phases."
    />
  );
}
