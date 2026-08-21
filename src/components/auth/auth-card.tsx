import Link from "next/link";
import type { ReactNode } from "react";
import { Anchor } from "lucide-react";

export function AuthCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <aside className="auth-instrument" aria-hidden="true">
        <span>BERTHIO ACCESS TERMINAL</span>
        <strong>56°57′N<br />24°06′E</strong>
        <small>ENCRYPTED SESSION / TLS<br />SYSTEM BUILD / 01</small>
      </aside>
      <Link className="brand auth-brand" href="/" aria-label="Berthio home">
        <span className="brand-mark"><Anchor aria-hidden="true" size={20} /></span>
        Berthio
      </Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  );
}
