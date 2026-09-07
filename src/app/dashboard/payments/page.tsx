import { AppShell } from "@/components/app-shell";
import { PaymentsLedger } from "@/components/payments/payments-ledger";
import { buildLedgerRows } from "@/components/payments/payments-ledger-model";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import shellStyles from "../overview.module.css";
import styles from "@/components/payments/payments-ledger.module.css";

export const metadata = { title: "Payments" };

// Read every page so the ledger summary is not silently capped by the API row limit.
async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await fetchPage(offset, offset + 499);
    if (error || !data) throw new Error("Unable to load the payments ledger.");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export default async function PaymentsPage() {
  const context = await requireMarinaMembership("/dashboard/payments");
  const supabase = await createClient();
  const [bookings, balances, payments] = await Promise.all([
    readAll((from, to) => supabase.from("bookings").select("*").eq("marina_id", context.marinaId).order("id").range(from, to)),
    readAll((from, to) => supabase.from("booking_payment_balances").select("*").eq("marina_id", context.marinaId).order("id").range(from, to)),
    readAll((from, to) => supabase.from("booking_payments").select("id,status,amount_total_minor,currency,updated_at").eq("marina_id", context.marinaId).order("id").range(from, to)),
  ]);
  const rows = buildLedgerRows(bookings, balances, payments, context.timezone);
  return <AppShell context={context} title="Payments" description="Booking payments and balances" wide
    className={shellStyles.overview} activePage="payments"
    overviewHeader={<div className={styles.breadcrumb}><span>Payments</span><span aria-hidden="true">/</span>Ledger</div>}>
    <header className={styles.heading}><h1>Payments</h1><p>Recorded payments, outstanding guest balances, and checkout attempts for {context.marinaName}.</p></header>
    <PaymentsLedger rows={rows} timeZone={context.timezone} />
  </AppShell>;
}
