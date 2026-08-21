import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BerthForm } from "@/components/berths/berth-form";
import { createBerthAction } from "@/app/dashboard/berths/actions";
import { requireMarinaMembership } from "@/lib/auth/session";

export const metadata = { title: "Add berth" };

export default async function NewBerthPage() {
  const context = await requireMarinaMembership("/dashboard/berths/new");
  if (context.role !== "marina_admin") notFound();

  return (
    <AppShell
      context={context}
      description="Record one physical berth and its safe operating limits."
      title="Add berth"
      wide
    >
      <BerthForm action={createBerthAction} cancelHref="/dashboard/berths" />
    </AppShell>
  );
}
