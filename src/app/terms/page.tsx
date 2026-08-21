import Link from "next/link";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return <main className="legal-page"><Link href="/">← DockPay</Link><p className="eyebrow">Legal / document pending</p><h1>Terms of service</h1><p>DockPay’s production terms will be published before the pilot opens to customers. This page intentionally avoids presenting placeholder language as an active agreement.</p></main>;
}
