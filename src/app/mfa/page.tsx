import { Anchor, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MfaForm } from "@/components/auth/mfa-form";
import styles from "@/components/auth/mfa.module.css";
import { logoutAction } from "@/app/auth/actions";
import { resolveAuthCallbackDestination } from "@/lib/auth/authorization";
import { getAuthorizationContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Verify your sign-in" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const context = await getAuthorizationContext({ allowUnverifiedAdmin: true });
  if (!context) redirect("/login");
  const next = resolveAuthCallbackDestination((await searchParams).next);
  if (context.role !== "marina_admin") redirect(next);
  const { data } = await (await createClient()).auth.getClaims();
  if (data?.claims?.aal === "aal2") redirect(next);

  const roleLabel = context.role === "marina_admin" ? "Harbor Admin" : "Marina Staff";
  const identity = [context.email, roleLabel].filter(Boolean).join(" • ");

  return <div className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Berthio home">
        <span className={styles.brandMark}><Anchor size={18} aria-hidden="true" /></span>
        <span className={styles.brandName}>Berthio</span>
        <span className={styles.brandSubtitle}>Dock Management</span>
      </Link>
      <span className={styles.accountIcon} role="img" aria-label={identity || "Signed-in account"} title={identity || "Signed-in account"}>
        <UserRound size={18} aria-hidden="true" />
      </span>
    </header>

    <main className={styles.main}>
      <div className={styles.flow}>
        <Link className={styles.back} href="/login"><span aria-hidden="true">←</span> Back</Link>
        <section className={styles.card} aria-label="Two-factor authentication">
          <MfaForm next={next} identity={identity} />
        </section>
      </div>
    </main>

    <form action={logoutAction} className={styles.signOut}>
      <button type="submit">Sign out</button>
    </form>
  </div>;
}
