import { ArrowRight, CalendarDays, Check, MapPin, Sailboat } from "lucide-react";
import { DemoLink } from "@/components/landing/demo-link";

function MarinaPreview() {
  return (
    <div className="marina-preview" aria-label="Illustration of the DockPay marina occupancy map">
      <div className="preview-toolbar">
        <span><MapPin size={15} aria-hidden="true" /> RIGA CITY MARINA / PIER C</span>
        <span className="live-pill">LIVE FEED</span>
      </div>
      <div className="marina-canvas">
        <div className="water-label"><Sailboat size={18} aria-hidden="true" /> DAUGAVA / 56°57′N 24°06′E</div>
        <div className="pier pier-one">
          {["free", "busy", "busy", "free", "arrival"].map((state, index) => (
            <span className={`berth berth-${state}`} key={`${state}-${index}`}><i /></span>
          ))}
        </div>
        <div className="pier pier-two">
          {["busy", "free", "arrival", "free"].map((state, index) => (
            <span className={`berth berth-${state}`} key={`${state}-${index}`}><i /></span>
          ))}
        </div>
        <div className="arrival-card">
          <span className="arrival-icon"><CalendarDays size={18} aria-hidden="true" /></span>
          <div><strong>SEA FINCH / LV-2048</strong><small>ETA 16:30 &middot; LOA 11.2 M &middot; DRAFT 1.8 M</small></div>
          <Check size={17} aria-label="Reservation confirmed" />
        </div>
      </div>
      <div className="occupancy-row">
        <div><span>Occupancy</span><strong>74%</strong></div>
        <div className="occupancy-bar"><span /></div>
        <small>18 BERTHS OPEN</small>
      </div>
    </div>
  );
}

export function Hero({ demoUrl }: { demoUrl: string | null }) {
  return (
    <section className="hero container">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-dot" /> Berth operations / system 01</p>
        <h1>Know what is arriving.<br /><em>Know where it goes.</em></h1>
        <p className="hero-lede">One operating picture for reservations, vessel dimensions, payment status, capacity, and berth assignment. Built for transient marina traffic.</p>
        <div className="hero-actions">
          <DemoLink className="button button-primary button-large" href={demoUrl ?? "#for-marinas"} location="hero" external={Boolean(demoUrl)}>
            Request pilot access <ArrowRight size={18} aria-hidden="true" />
          </DemoLink>
          <a className="button button-secondary button-large" href="#how-it-works">Inspect workflow</a>
        </div>
        <div className="hero-proof">
          <span><Check size={15} aria-hidden="true" /> 0% booking commission</span>
          <span><Check size={15} aria-hidden="true" /> Capacity checked before confirmation</span>
        </div>
      </div>
      <MarinaPreview />
    </section>
  );
}
