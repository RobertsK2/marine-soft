import { Anchor } from "lucide-react";
import Link from "next/link";

const groups = [
  ["Product", [["Features", "#product"], ["How it works", "#how-it-works"], ["Pricing", "#pricing"]]],
  ["Company", [["For marinas", "#for-marinas"], ["Contact", "#for-marinas"]]],
  ["Legal", [["Privacy", "/privacy"], ["Terms", "/terms"]]],
  ["Support", [["Login", "/login"], ["Create boater account", "/signup"]]],
] as const;

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand"><Link className="brand brand-light" href="/"><span className="brand-mark"><Anchor size={18} aria-hidden="true" /></span>DockPay</Link><p>Reservation and berth operations software for transient marina traffic.</p><small>56°57′N / 24°06′E<br />SYSTEM BUILD / 01</small></div>
        {groups.map(([title, links]) => <div className="footer-group" key={title}><h2>{title}</h2>{links.map(([label, href]) => <Link href={href} key={label}>{label}</Link>)}</div>)}
      </div>
      <div className="container footer-bottom"><p>&copy; {new Date().getUTCFullYear()} DockPay. All rights reserved.</p><p>MARINA OPERATIONS / RIGA, LATVIA</p></div>
    </footer>
  );
}
