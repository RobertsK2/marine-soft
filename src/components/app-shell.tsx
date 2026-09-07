import type { ReactNode } from "react";
import type { AuthorizationContext } from "@/types/auth";

export function AppShell({
  context,
  title,
  description,
  children,
  wide = false,
  overviewHeader,
  className,
}: {
  context: AuthorizationContext;
  title: string;
  description: string;
  children?: ReactNode;
  wide?: boolean;
  overviewHeader?: ReactNode;
  className?: string;
  activePage?: "overview" | "map" | "bookings" | "berths" | "payments" | "settings";
}) {
  return (
    <div className={`app-shell admin-page${className ? ` ${className}` : ""}`}>
      <main className={`app-placeholder${wide ? " app-placeholder-wide" : ""}`}>
        {overviewHeader ?? <>
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
        </>}
        {children}
      </main>
    </div>
  );
}
