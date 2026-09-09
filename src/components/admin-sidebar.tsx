"use client";

import { Anchor, Banknote, CalendarDays, LayoutDashboard, LogOut, Map, Rows3, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/auth/actions";
import type { AuthorizationContext } from "@/types/auth";
import shellStyles from "@/app/dashboard/overview.module.css";
import inventoryStyles from "@/components/berths/berths-inventory.module.css";

type SidebarContext = Pick<AuthorizationContext, "email" | "role" | "marinaName" | "organizationName"> | null;

export function AdminFrame({ context, children }: { context: SidebarContext; children: ReactNode }) {
  const pathname = usePathname();
  return <div className={`app-shell admin-layout ${shellStyles.overview}${pathname === "/dashboard/berths" ? ` ${inventoryStyles.shell}` : ""}`}>
    <AdminSidebar context={context} />
    <div className="admin-content">{children}</div>
  </div>;
}

function AdminSidebar({ context }: { context: SidebarContext }) {
  const pathname = usePathname();
  const activePage = pathname.startsWith("/dashboard/settings") || pathname.startsWith("/dashboard/audit") ? "settings"
    : pathname.startsWith("/dashboard/bookings") ? "bookings"
    : pathname.startsWith("/dashboard/berths") ? "berths"
    : pathname.startsWith("/dashboard/marina-map") ? "map"
    : pathname.startsWith("/dashboard/payments") ? "payments" : "overview";
  return (
      <header className="app-bar">
        <Link className="brand" href="/dashboard" aria-label="Go to Overview">
          <span className="brand-mark">
            <Anchor size={18} aria-hidden="true" />
          </span>
          Berthio
        </Link>
        <nav aria-label="Marina administration" className="app-nav">
          <Link href="/dashboard" aria-current={activePage === "overview" ? "page" : undefined}>
            <LayoutDashboard size={15} aria-hidden="true" />
            Overview
          </Link>
          <Link href="/dashboard/bookings" aria-current={activePage === "bookings" ? "page" : undefined}>
            <CalendarDays size={15} aria-hidden="true" />
            Bookings
          </Link>
          <Link href="/dashboard/berths" aria-current={activePage === "berths" ? "page" : undefined}>
            <Rows3 size={15} aria-hidden="true" />
            Berths
          </Link>
          <Link href="/dashboard/marina-map" aria-current={activePage === "map" ? "page" : undefined}>
            <Map size={15} aria-hidden="true" />
            Berth Map
          </Link>
          <Link href="/dashboard/payments" aria-current={activePage === "payments" ? "page" : undefined}>
            <Banknote size={15} aria-hidden="true" />
            Payments
          </Link>
          {context?.role === "marina_admin" ? (
            <Link href="/dashboard/settings" aria-current={activePage === "settings" ? "page" : undefined}>
              <Settings size={15} aria-hidden="true" />
              Settings
            </Link>
          ) : null}
        </nav>
        <div className="app-user">
          {context ? <div className="overview-tenant"><Anchor size={22} aria-hidden="true" /><span>{context.marinaName}<small>{context.organizationName}</small></span></div> : null}
          {context ? <span>{context.email ?? "Marina user"}</span> : null}
          <form action={logoutAction}>
            <button className="button button-quiet" type="submit">
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          </form>
        </div>
      </header>
  );
}
