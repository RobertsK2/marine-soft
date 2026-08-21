"use client";

import type { ReactNode } from "react";
import { trackEvent } from "@/lib/monitoring/client";

export function DemoLink({ href, className, location, external, children }: { href: string; className: string; location: string; external: boolean; children: ReactNode }) {
  return (
    <a
      className={className}
      href={href}
      onClick={() => trackEvent("demo_cta_clicked", { location })}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}
