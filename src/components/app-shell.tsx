import { Anchor, CalendarDays, LayoutDashboard, LogOut, Rows3 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/auth/actions";
import type { AuthorizationContext } from "@/types/auth";

export function AppShell({
  context,
  title,
  description,
  children,
  wide = false,
}: {
  context: AuthorizationContext;
  title: string;
  description: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="app-shell">
      <header className="app-bar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Anchor size={18} aria-hidden="true" />
          </span>
          Berthio
        </Link>
        <nav aria-label="Marina administration" className="app-nav">
          <Link href="/dashboard">
            <LayoutDashboard size={15} aria-hidden="true" />
            Dashboard
          </Link>
          <Link href="/dashboard/berths">
            <Rows3 size={15} aria-hidden="true" />
            Berths
          </Link>
          <Link href="/dashboard/bookings">
            <CalendarDays size={15} aria-hidden="true" />
            Bookings
          </Link>
        </nav>
        <div className="app-user">
          <span>{context.email ?? "Marina user"}</span>
          <form action={logoutAction}>
            <button className="button button-quiet" type="submit">
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className={`app-placeholder${wide ? " app-placeholder-wide" : ""}`}>
        <div className="app-status">
          <span>{context.role.replace("_", " ").toUpperCase()}</span>
          <span>{context.timezone}</span>
        </div>
        <p className="eyebrow">{context.organizationName}</p>
        <h1>{title}</h1>
        <p className="tenant-summary">
          {context.marinaName} / {context.marinaSlug}
        </p>
        <p>{description}</p>
        {children}
      </main>
    </div>
  );
}
