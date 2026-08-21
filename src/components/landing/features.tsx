import {
  Anchor,
  CalendarCheck,
  ChartNoAxesCombined,
  CreditCard,
  Map,
  Sparkles,
} from "lucide-react";

const features = [
  [CalendarCheck, "Online reservations", "Boaters reserve transient marina capacity online without waiting for a phone call."],
  [CreditCard, "Online payments", "Customers can pay during booking by card, Apple Pay, or Google Pay when payments launch."],
  [ChartNoAxesCombined, "Live availability", "Keep reservation capacity current and stop accepting bookings before the marina is overcommitted."],
  [Map, "Marina map", "Represent physical berths in an interactive map that matches how the marina actually operates."],
  [Sparkles, "Smart berth assignment", "Guarantee suitable capacity now, then assign the physical berth closer to vessel arrival."],
  [Anchor, "Marina operations", "Coordinate arrivals, departures, ETA, ETD, blocked berths, and manual reservations in one place."],
] as const;

export function Features() {
  return (
    <section className="section" id="product" aria-labelledby="features-title">
      <div className="container">
        <div className="section-heading centered-heading">
          <p className="eyebrow">System modules / 01–06</p>
          <h2 id="features-title">Every arrival passes the same checks.</h2>
          <p>Reservation data enters once, stays attached to the vessel, and remains visible through berth assignment.</p>
        </div>
        <div className="feature-grid">
          {features.map(([Icon, title, description], index) => (
            <article className="feature-card" key={title}>
              <div className="feature-icon"><Icon aria-hidden="true" /></div>
              <span className="feature-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <small>STATUS / PILOT SPECIFICATION</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
