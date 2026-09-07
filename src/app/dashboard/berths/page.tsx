import { AppShell } from "@/components/app-shell";
import { BerthsInventory } from "@/components/berths/berths-inventory";
import { listBerths } from "@/domain/berths/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import shellStyles from "../overview.module.css";
import styles from "@/components/berths/berths-inventory.module.css";

export const metadata = { title: "Berths" };

export default async function BerthsPage() {
  const context = await requireMarinaMembership("/dashboard/berths");
  const supabase = await createClient();
  const berths = await listBerths(supabase, context.marinaId);
  return <AppShell context={context} title="Berths" description="Physical berth inventory" wide
    className={`${shellStyles.overview} ${styles.shell}`} activePage="berths"
    overviewHeader={<div className={styles.breadcrumb}><span>Berths</span><span aria-hidden="true">/</span>Inventory</div>}>
    <header className={styles.heading}><h1>Berths</h1><p>Physical berth and slip inventory, technical clearance limits, and allocation rules for {context.marinaName}.</p></header>
    <BerthsInventory berths={berths} canManage={context.role === "marina_admin"} />
  </AppShell>;
}
