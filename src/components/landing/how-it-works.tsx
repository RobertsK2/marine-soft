import { Anchor, Sailboat } from "lucide-react";

const boaterSteps = ["Select dates", "Enter vessel", "Pay online", "Receive berth before arrival"];
const marinaSteps = ["Configure marina", "Receive bookings", "Track capacity", "Assign berth"];

function Steps({ title, label, steps, marina = false }: { title: string; label: string; steps: readonly string[]; marina?: boolean }) {
  const Icon = marina ? Anchor : Sailboat;
  return (
    <article className={`steps-card ${marina ? "steps-card-dark" : ""}`}>
      <div className="steps-title"><span><Icon aria-hidden="true" /></span><div><small>{label}</small><h3>{title}</h3></div></div>
      <ol>
        {steps.map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}
      </ol>
    </article>
  );
}

export function HowItWorks() {
  return (
    <section className="section how-section" id="how-it-works" aria-labelledby="how-title">
      <div className="container">
        <div className="section-heading centered-heading">
          <p className="eyebrow">Two routes / one record</p>
          <h2 id="how-title">From requested dates to assigned berth.</h2>
        </div>
        <div className="steps-grid">
          <Steps title="Reserve with confidence" label="For boaters" steps={boaterSteps} />
          <Steps title="Stay in operational control" label="For marinas" steps={marinaSteps} marina />
        </div>
      </div>
    </section>
  );
}
