import { Calculator, ReceiptText, XCircle } from "lucide-react";
import type {
  PriceNightSnapshot,
  PublicPriceQuote,
} from "@/domain/pricing/types";

function money(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat("en", {
    currency,
    style: "currency",
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}

function groupedNights(nights: PriceNightSnapshot[]) {
  const groups = new Map<
    string,
    PriceNightSnapshot & { quantity: number; totalMinor: number }
  >();

  for (const night of nights) {
    const key = `${night.season}:${night.rateUnit}:${night.rateMinor}`;
    const group = groups.get(key);
    if (group) {
      group.quantity += 1;
      group.totalMinor += night.amountMinor;
    } else {
      groups.set(key, { ...night, quantity: 1, totalMinor: night.amountMinor });
    }
  }

  return [...groups.values()];
}

function feeUnit(type: PublicPriceQuote["mandatoryFees"][number]["type"]) {
  if (type === "per_night") return "per night";
  if (type === "per_vessel") return "per vessel";
  if (type === "percentage") return "of accommodation";
  return "per booking";
}

export function PriceQuote({
  error,
  quote,
}: {
  error?: string;
  quote: PublicPriceQuote | null;
}) {
  if (error) {
    return (
      <div className="public-price-error" role="alert">
        <XCircle aria-hidden="true" size={22} />
        <div>
          <strong>Price could not be calculated</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!quote) return null;

  const rateGroups = groupedNights(quote.nights);
  const taxPercent = (quote.taxRateBps / 100).toFixed(2).replace(/\.00$/, "");

  return (
    <section
      aria-labelledby="public-price-heading"
      className="public-price-quote"
      data-price-currency={quote.currency}
      data-price-total-minor={quote.totalMinor}
    >
      <header>
        <div>
          <p><Calculator aria-hidden="true" size={15} /> Server-calculated quote</p>
          <h3 id="public-price-heading">Price breakdown</h3>
        </div>
        <strong>{money(quote.totalMinor, quote.currency)}</strong>
      </header>

      <dl className="public-price-lines">
        {rateGroups.map((group) => (
          <div key={`${group.season}:${group.rateUnit}:${group.rateMinor}`}>
            <dt>
              <strong>{group.season}</strong>
              <span>
                {group.quantity} {group.quantity === 1 ? "night" : "nights"} · {money(group.rateMinor, quote.currency)}
                {group.rateUnit === "meter_night" ? ` / m · ${quote.vesselLengthM.toFixed(2)} m` : " / night"}
              </span>
            </dt>
            <dd>{money(group.totalMinor, quote.currency)}</dd>
          </div>
        ))}
        {quote.mandatoryFees.map((fee) => (
          <div key={`${fee.type}:${fee.name}`}>
            <dt>
              <strong>{fee.name}</strong>
              <span>
                Mandatory · {fee.type === "percentage" && fee.percentageBps !== null
                  ? `${(fee.percentageBps / 100).toFixed(2).replace(/\.00$/, "")}% ${feeUnit(fee.type)}`
                  : `${fee.quantity} × ${money(fee.unitAmountMinor ?? 0, quote.currency)} ${feeUnit(fee.type)}`}
              </span>
            </dt>
            <dd>{money(fee.amountMinor, quote.currency)}</dd>
          </div>
        ))}
        <div className="public-price-subtotal">
          <dt>Configured subtotal</dt>
          <dd>{money(quote.subtotalMinor, quote.currency)}</dd>
        </div>
        <div>
          <dt>
            <strong>Tax / VAT {taxPercent}%</strong>
            <span>{quote.taxBehavior === "inclusive" ? "Included in configured prices" : "Added to configured prices"}</span>
          </dt>
          <dd>{money(quote.taxMinor, quote.currency)}</dd>
        </div>
        <div className="public-price-total">
          <dt><ReceiptText aria-hidden="true" size={16} /> Final tax-inclusive total</dt>
          <dd>{money(quote.totalMinor, quote.currency)}</dd>
        </div>
      </dl>
      <p className="public-price-note">
        Every occupied night uses its active seasonal rate. This quote is calculated on the server; no booking, payment, or capacity hold has been created.
      </p>
    </section>
  );
}
