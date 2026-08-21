"use client";

import { Anchor, LogOut, Menu, ShipWheel, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { logoutAction } from "@/app/auth/actions";

type HeaderAuth = {
  displayName: string;
  primaryHref: "/dashboard";
  primaryLabel: "Dashboard";
};

const navigation = [
  ["System", "#product"],
  ["Workflow", "#how-it-works"],
  ["Plans", "#pricing"],
  ["Pilot access", "#for-marinas"],
] as const;

function AuthLinks({ auth }: { auth: HeaderAuth | null }) {
  if (!auth) {
    return (
      <>
        <Link className="button button-quiet" href="/login">Log in</Link>
      </>
    );
  }

  return (
    <>
      <Link className="button button-quiet" href={auth.primaryHref}>{auth.primaryLabel}</Link>
      <span className="avatar" title={auth.displayName} aria-label={`Signed in as ${auth.displayName}`}>
        {auth.displayName.charAt(0).toUpperCase()}
      </span>
      <form action={logoutAction}>
        <button className="button button-icon" type="submit" aria-label="Log out">
          <LogOut size={17} aria-hidden="true" />
        </button>
      </form>
    </>
  );
}

export function Header({ auth }: { auth: HeaderAuth | null }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/" aria-label="Berthio home">
          <span className="brand-mark"><Anchor size={19} aria-hidden="true" /></span>
          Berthio
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="desktop-auth"><AuthLinks auth={auth} /></div>
        <button
          className="mobile-menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open ? (
        <div className="mobile-navigation" id="mobile-navigation">
          <nav aria-label="Mobile navigation">
            {navigation.map(([label, href]) => (
              <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
            ))}
          </nav>
          <div className="mobile-auth"><AuthLinks auth={auth} /></div>
          <p><ShipWheel size={16} aria-hidden="true" /> System status / pilot build 01</p>
        </div>
      ) : null}
    </header>
  );
}
