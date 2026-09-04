import { Anchor, Banknote, CalendarDays, ClipboardClock, LayoutDashboard, LogOut, Map, PlugZap, Rows3, Settings, ShieldCheck } from "lucide-react";
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
            Overview
          </Link>
          <Link href="/dashboard/berths">
            <Rows3 size={15} aria-hidden="true" />
            Berths
          </Link>
          <Link href="/dashboard/bookings">
            <CalendarDays size={15} aria-hidden="true" />
            Bookings
          </Link>
          <Link href="/dashboard/marina-map">
            <Map size={15} aria-hidden="true" />
            Marina map
          </Link>
          {context.role === "marina_admin" ? (
            <>
              <Link href="/dashboard/audit">
                <ClipboardClock size={15} aria-hidden="true" />
                Audit log
              </Link>
              <Link href="/dashboard/settings">
                <Settings size={15} aria-hidden="true" />
                Settings
              </Link>
              <Link href="/dashboard/settings/pricing">
                <Banknote size={15} aria-hidden="true" />
                Pricing
              </Link>
              <Link href="/dashboard/settings/cancellation-policy">
                <ShieldCheck size={15} aria-hidden="true" />
                Cancellation policy
              </Link>
              <Link href="/dashboard/settings/integrations">
                <PlugZap size={15} aria-hidden="true" />
                Integrations
              </Link>
            </>
          ) : null}
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
