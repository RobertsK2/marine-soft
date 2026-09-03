import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BerthImportForm } from "@/components/berths/berth-import-form";
import { requireMarinaMembership } from "@/lib/auth/session";

export const metadata = { title: "Import berths" };

export default async function ImportBerthsPage() {
  const context = await requireMarinaMembership("/dashboard/berths/import");
  if (context.role !== "marina_admin") notFound();

  return (
    <AppShell
      context={context}
      description="Validate a CSV inventory, review row-level results, then add every valid berth in one transaction."
      title="Import berths"
      wide
    >
      <BerthImportForm />
    </AppShell>
  );
}
