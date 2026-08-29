import { ShieldX } from "lucide-react";
import Link from "next/link";

export default function GuestBookingNotFound() {
  return (
    <main className="guest-booking-unavailable">
      <ShieldX size={32} aria-hidden="true" />
      <p className="public-marina-section-code">Guest booking access</p>
      <h1>Link unavailable</h1>
      <p>This management link is invalid, expired, or revoked. Ask the marina for a new link.</p>
      <Link className="button button-secondary" href="/">Return to Berthio</Link>
    </main>
  );
}
