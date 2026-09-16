# M5.3 — Public Legal and Booking Correctness

## Goal

Remove public-facing placeholder/legal debt and make customer-facing booking language accurately reflect real system behavior.

This phase is intentionally narrow. It is not a public-site redesign.

## Part A — Terms and Privacy

### Problem

The audit found placeholder public legal pages and stale DockPay branding. A real pilot must not send guests or marina staff to obviously unfinished legal pages.

### Rule

Do **not** ask Codex or another model to invent final legal terms and pretend they are approved legal advice.

The implementation task and the legal-content task are separate:

1. obtain/finalize approved Terms of Service text;
2. obtain/finalize approved Privacy Policy text;
3. ensure the correct Berthio legal/entity/contact information is present;
4. implement those approved documents in the existing routes;
5. remove stale DockPay references;
6. verify links from login/public booking/footer areas.

### Legal content checklist

At minimum the approved documents should deliberately address the product actually being piloted, including applicable areas such as:

- who operates Berthio;
- relationship between Berthio, marina, and guest;
- booking/payment role;
- pay-online vs pay-at-marina behavior where relevant;
- cancellation-policy handling;
- privacy/data processing;
- transactional email;
- third-party providers such as payment/hosting/monitoring vendors where legally required;
- contact method;
- effective date/version.

The exact legal wording is outside the software audit and should be approved separately.

## Part B — Booking trust/copy correctness

### Problem 1 — “Capacity reserved” before reservation

Do not claim capacity is reserved before the backend has actually secured a hold/booking.

On the initial availability/search state, use copy that describes what is true, for example suitability/availability, not reservation.

Only show reservation/hold language after the relevant server-side state exists, and avoid exposing internal hold mechanics unless useful to the guest.

### Problem 2 — Stripe language when pay-at-marina is allowed

The public page must reflect the marina’s configured payment methods.

If online payment only:

- Stripe/secure online payment language may be shown where appropriate.

If pay at marina only:

- do not tell the guest that online Stripe payment is required;
- explain that payment is due at the marina in the confirmation/review state.

If both:

- keep generic trust copy until the guest chooses a method;
- reflect the selected method in the review/confirmation state.

### Problem 3 — CTA flow consistency

Desktop and mobile can differ in presentation, but they must represent the same booking semantics:

- check availability;
- review booking;
- choose payment method only when more than one is available;
- continue to payment for online payment;
- confirm pay-at-marina booking without creating Stripe Checkout;
- preserve concurrency-safe capacity protection in both flows.

## Part C — Desktop auto-scroll regression check

The desktop experience should automatically move the guest to the newly rendered successful availability/review section after a successful availability check.

Required behavior:

- no scroll on validation error;
- no scroll on unavailable result;
- scroll only after the successful result is rendered;
- respect reduced-motion preference;
- do not repeatedly scroll on unrelated re-renders;
- mobile 2-step flow remains unchanged.

## Testing matrix

Test public booking for each payment configuration:

| Configuration | Expected behavior |
| --- | --- |
| Online only | no selector; online checkout path |
| Pay at marina only | no selector; booking completes without Stripe Checkout |
| Both | selector shown; both paths work |

For each configuration verify:

- available result;
- unavailable result;
- guest edits dates after a result;
- dimensions become invalid;
- repeated submit/double-click;
- desktop auto-scroll;
- mobile step transition;
- final total and payment state;
- confirmation wording.

## Exit criteria

- [ ] Terms page contains approved Berthio content, not placeholder content;
- [ ] Privacy page contains approved Berthio content, not placeholder content;
- [ ] no stale DockPay branding remains on public legal/auth/booking paths;
- [ ] no “reserved” wording is shown before capacity is actually secured;
- [ ] Stripe language is conditional on real payment configuration;
- [ ] pay-at-marina copy is correct;
- [ ] desktop auto-scroll works only on successful availability;
- [ ] mobile step flow is unchanged and tested;
- [ ] online-only, on-site-only, and dual-method scenarios pass.
