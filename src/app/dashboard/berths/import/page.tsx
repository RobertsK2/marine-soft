import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BerthImportForm } from "@/components/berths/berth-import-form";
import { requireMarinaMembership } from "@/lib/auth/session";
import shellStyles from "../../overview.module.css";
import styles from "@/components/berths/berth-import.module.css";

export const metadata = { title: "Import Berths" };

export default async function ImportBerthsPage() {
  const context = await requireMarinaMembership("/dashboard/berths/import");
  if (context.role !== "marina_admin") notFound();

  return (
    <AppShell
      activePage="berths"
      className={`${shellStyles.overview} ${styles.shell}`}
      context={context}
      description="Validate a CSV inventory, review row-level results, then add every valid berth in one transaction."
      title="Import Berths"
      wide
      overviewHeader={<nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/dashboard/berths">Berths</Link><ChevronRight size={13} aria-hidden="true" /><strong aria-current="page">CSV Import</strong></nav>}
    >
      <Link className={styles.back} href="/dashboard/berths"><ArrowLeft size={14} aria-hidden="true" />Back to Berths</Link>
      <header className={styles.heading}><h1>Import Berths</h1><p>Upload, validate, and import a complete berth inventory CSV.</p></header>
      <BerthImportForm />
    </AppShell>
  );
}
