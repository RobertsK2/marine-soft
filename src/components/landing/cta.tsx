import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { DemoLink } from "@/components/landing/demo-link";

export function Cta({ demoUrl }: { demoUrl: string | null }) {
  return (
    <section className="cta-section" id="for-marinas" aria-labelledby="cta-title">
      <div className="container cta-inner">
        <div>
          <p className="eyebrow eyebrow-light">Pilot intake / Riga / 2026</p>
          <h2 id="cta-title">Bring one week of arrival records.</h2>
          <p>We map your booking channels, vessel checks, berth rules, and handover points. You receive a pilot scope based on the marina you actually operate.</p>
          <div className="cta-points"><span><CheckCircle2 size={17} />Guided onboarding</span><span><CheckCircle2 size={17} />No booking commission</span></div>
        </div>
        <DemoLink className="button button-primary button-large" href={demoUrl ?? "#pricing"} location="final_cta" external={Boolean(demoUrl)}>Request workflow review <ArrowUpRight size={18} aria-hidden="true" /></DemoLink>
      </div>
    </section>
  );
}
