import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AddBerthForm } from "@/components/berths/add-berth-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import shellStyles from "../../overview.module.css";
import styles from "@/components/berths/add-berth.module.css";
import { createBerthAction } from "@/app/dashboard/berths/actions";
import { requireMarinaMembership } from "@/lib/auth/session";

export const metadata = { title: "Add berth" };

export default async function NewBerthPage() {
  const context = await requireMarinaMembership("/dashboard/berths/new");
  if (context.role !== "marina_admin") notFound();

  return (
    <AppShell
      className={shellStyles.overview}
      activePage="berths"
      overviewHeader={<div className={styles.breadcrumb}><Link href="/dashboard/berths">Berths</Link><span>/</span><Link href="/dashboard/berths">Inventory</Link><span>/</span><strong>Add Berth</strong></div>}
      context={context}
      description="Record one physical berth and its safe operating limits."
      title="Add berth"
      wide
    >
      <Link className={styles.back} href="/dashboard/berths"><ArrowLeft size={14} aria-hidden="true" />Back to Berth Inventory</Link>
      <header className={styles.heading}><h1>Add Berth</h1><p>Register a new physical berth or mooring slip in {context.marinaName} inventory.</p></header>
      <AddBerthForm action={createBerthAction} marinaName={context.marinaName} />
    </AppShell>
  );
}
