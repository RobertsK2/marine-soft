import { Check } from "lucide-react";
import { DemoLink } from "@/components/landing/demo-link";

export const MARINA_PLANS = [
  { name: "Starter", audience: "Small marinas", limit: "Up to 50 berths", featured: false, features: ["Online reservations", "Availability management", "Marina map foundation"] },
  { name: "Growth", audience: "Medium marinas", limit: "Up to 150 berths", featured: true, features: ["Everything in Starter", "Operational workflows", "Priority onboarding"] },
  { name: "Pro", audience: "Larger marinas", limit: "150+ berths", featured: false, features: ["Everything in Growth", "Multi-marina ready", "Tailored implementation"] },
] as const;

export function Pricing({ demoUrl }: { demoUrl: string | null }) {
  const href = demoUrl ?? "#for-marinas";
  return (
    <section className="section pricing-section" id="pricing" aria-labelledby="pricing-title">
      <div className="container">
        <div className="section-heading centered-heading">
          <p className="eyebrow">License schedule / by capacity</p>
          <h2 id="pricing-title">Pay for operating capacity. Not booking volume.</h2>
          <p>Monthly or yearly licenses are set by berth count and operating scope. Pilot terms are issued after a marina workflow review.</p>
        </div>
        <div className="pricing-grid">
          {MARINA_PLANS.map((plan) => (
            <article className={`pricing-card ${plan.featured ? "pricing-featured" : ""}`} key={plan.name}>
              {plan.featured ? <span className="recommended">Recommended</span> : null}
              <p className="plan-audience">{plan.audience}</p>
              <h3>{plan.name}</h3>
              <strong className="plan-limit">{plan.limit}</strong>
              <p className="plan-price">Pilot quote <span>monthly or annual license</span></p>
              <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
              <DemoLink className={`button ${plan.featured ? "button-primary" : "button-secondary"}`} href={href} location={`pricing_${plan.name.toLowerCase()}`} external={Boolean(demoUrl)}>Request specification</DemoLink>
            </article>
          ))}
        </div>
        <p className="pricing-note">DockPay V1 does not take a percentage of customer bookings.</p>
      </div>
    </section>
  );
}
