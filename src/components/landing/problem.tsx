import { FileSpreadsheet, Mail, Phone, WalletCards } from "lucide-react";

const items = [
  [Phone, "Calls interrupt the day", "Availability gets checked while the customer waits."],
  [Mail, "Email creates loose ends", "Dates, vessel details, and replies become hard to follow."],
  [FileSpreadsheet, "Spreadsheets lag behind", "Capacity changes faster than a shared workbook can."],
  [WalletCards, "Payments stay manual", "Deposits and confirmations add another coordination step."],
] as const;

export function Problem() {
  return (
    <section className="section problem-section" aria-labelledby="problem-title">
      <div className="container">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Failure points / current method</p><h2 id="problem-title">Four channels. No reliable occupancy picture.</h2></div>
          <p>A reservation is only useful when dates, vessel dimensions, payment, and berth capacity agree. Disconnected tools make that check manual.</p>
        </div>
        <div className="problem-grid">
          {items.map(([Icon, title, description]) => (
            <article key={title}><Icon aria-hidden="true" /><h3>{title}</h3><p>{description}</p></article>
          ))}
        </div>
      </div>
    </section>
  );
}
