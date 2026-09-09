import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./login.module.css";

export function LoginSurface({ children }: { children: ReactNode }) {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Berthio home">
        <Image src="/brand/berthio-mark.svg" alt="" width={32} height={40} priority />
        <span>Berthio</span>
      </Link>
    </header>
    <main className={styles.main}>
      <div className={styles.surface}>
      <aside className={styles.brandPanel} aria-label="About Berthio">
        <Link className={styles.brand} href="/" aria-label="Berthio home">
          <Image src="/brand/berthio-mark.svg" alt="" width={32} height={40} priority />
          <span>Berthio</span>
        </Link>
        <div className={styles.brandCopy}>
          <h2>Marina operations,<br />in one place.</h2>
          <p>The calm workspace for berth allocation, guest arrivals, and harbor management.</p>
        </div>
      </aside>
      <section className={styles.card} aria-labelledby="auth-title">
        <div className={styles.intro}>
          <span className={styles.mark}><Image src="/brand/berthio-mark.svg" alt="" width={32} height={40} priority /></span>
          <h1 id="auth-title">Sign in to Berthio</h1>
          <p>Access your marina operational workspace.</p>
        </div>
        {children}
      </section>
      </div>
    </main>
    <footer className={styles.footer}><Link href="/privacy">Privacy Policy</Link><span aria-hidden="true">·</span><Link href="/terms">Terms</Link></footer>
  </div>;
}
