"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { MarinaProfileActionState } from "@/app/dashboard/settings/actions";
import type {
  MarinaProfile,
  MarinaProfileFieldErrors,
} from "@/domain/marina-profile/types";

const initialState: MarinaProfileActionState = { status: "idle" };

type ProfileAction = (
  state: MarinaProfileActionState,
  formData: FormData,
) => Promise<MarinaProfileActionState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button-primary" disabled={pending} type="submit">
      {pending ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : null}
      {pending ? "Saving..." : "Save marina profile"}
    </button>
  );
}

function FieldError({
  errors,
  field,
}: {
  errors?: MarinaProfileFieldErrors;
  field: keyof MarinaProfileFieldErrors;
}) {
  const message = errors?.[field];
  return message ? <p className="field-error" id={`${field}-error`}>{message}</p> : null;
}

function describedBy(errors: MarinaProfileFieldErrors | undefined, field: keyof MarinaProfileFieldErrors, helpId?: string) {
  return [helpId, errors?.[field] ? `${field}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function MarinaProfileForm({
  action,
  profile,
  timezones,
}: {
  action: ProfileAction;
  profile: MarinaProfile;
  timezones: readonly string[];
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="marina-profile-form" noValidate>
      <section className="form-section" aria-labelledby="marina-identity-heading">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2 id="marina-identity-heading">Marina identity</h2>
            <p>The operational and public name for this marina.</p>
          </div>
        </div>
        <div className="berth-form-grid berth-form-grid-two">
          <div className="form-field">
            <label htmlFor="name">Marina name</label>
            <input
              aria-describedby={describedBy(state.fieldErrors, "name")}
              aria-invalid={Boolean(state.fieldErrors?.name)}
              defaultValue={profile.name}
              id="name"
              maxLength={160}
              name="name"
              required
            />
            <FieldError errors={state.fieldErrors} field="name" />
          </div>
          <div className="form-field">
            <label htmlFor="slug">Public slug</label>
            <input disabled id="slug" value={profile.slug} />
            <p className="field-help">Read-only in this phase.</p>
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby="marina-public-heading">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2 id="marina-public-heading">Public details</h2>
            <p>Factual information shown on the marina&apos;s existing public booking page.</p>
          </div>
        </div>
        <div className="marina-profile-stack">
          <div className="form-field">
            <label htmlFor="publicDescription">Public description</label>
            <textarea
              aria-describedby={describedBy(state.fieldErrors, "publicDescription", "publicDescription-help")}
              aria-invalid={Boolean(state.fieldErrors?.publicDescription)}
              defaultValue={profile.public_description ?? ""}
              id="publicDescription"
              maxLength={600}
              name="publicDescription"
              rows={4}
            />
            <p className="field-help" id="publicDescription-help">Maximum 600 characters.</p>
            <FieldError errors={state.fieldErrors} field="publicDescription" />
          </div>
          <div className="berth-form-grid berth-form-grid-two">
            <div className="form-field">
              <label htmlFor="localLanguage">Local language</label>
              <input
                aria-describedby={describedBy(state.fieldErrors, "localLanguage", "localLanguage-help")}
                aria-invalid={Boolean(state.fieldErrors?.localLanguage)}
                defaultValue={profile.local_language ?? ""}
                id="localLanguage"
                maxLength={64}
                name="localLanguage"
                placeholder="Latviešu"
              />
              <p className="field-help" id="localLanguage-help">Language name shown above the local harbour note.</p>
              <FieldError errors={state.fieldErrors} field="localLanguage" />
            </div>
            <div className="form-field marina-profile-local-copy">
              <label htmlFor="publicDescriptionLocal">Local description</label>
              <textarea
                aria-describedby={describedBy(state.fieldErrors, "publicDescriptionLocal")}
                aria-invalid={Boolean(state.fieldErrors?.publicDescriptionLocal)}
                defaultValue={profile.public_description_local ?? ""}
                id="publicDescriptionLocal"
                maxLength={600}
                name="publicDescriptionLocal"
                rows={4}
              />
              <FieldError errors={state.fieldErrors} field="publicDescriptionLocal" />
            </div>
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby="marina-contact-heading">
        <div className="form-section-heading">
          <span>03</span>
          <div>
            <h2 id="marina-contact-heading">Public contact</h2>
            <p>Only completed fields appear on an already-published marina page.</p>
          </div>
        </div>
        <div className="berth-form-grid berth-form-grid-two">
          <div className="form-field">
            <label htmlFor="contactEmail">Contact email</label>
            <input
              aria-describedby={describedBy(state.fieldErrors, "contactEmail")}
              aria-invalid={Boolean(state.fieldErrors?.contactEmail)}
              defaultValue={profile.contact_email ?? ""}
              id="contactEmail"
              maxLength={254}
              name="contactEmail"
              type="email"
            />
            <FieldError errors={state.fieldErrors} field="contactEmail" />
          </div>
          <div className="form-field">
            <label htmlFor="contactPhone">Contact phone</label>
            <input
              aria-describedby={describedBy(state.fieldErrors, "contactPhone")}
              aria-invalid={Boolean(state.fieldErrors?.contactPhone)}
              defaultValue={profile.contact_phone ?? ""}
              id="contactPhone"
              inputMode="tel"
              maxLength={32}
              name="contactPhone"
              type="tel"
            />
            <FieldError errors={state.fieldErrors} field="contactPhone" />
          </div>
          <div className="form-field marina-profile-wide-field">
            <label htmlFor="websiteUrl">Website</label>
            <input
              aria-describedby={describedBy(state.fieldErrors, "websiteUrl", "websiteUrl-help")}
              aria-invalid={Boolean(state.fieldErrors?.websiteUrl)}
              defaultValue={profile.website_url ?? ""}
              id="websiteUrl"
              maxLength={2048}
              name="websiteUrl"
              placeholder="https://marina.example"
              type="url"
            />
            <p className="field-help" id="websiteUrl-help">HTTPS only.</p>
            <FieldError errors={state.fieldErrors} field="websiteUrl" />
          </div>
        </div>
      </section>

      <section className="form-section" aria-labelledby="marina-timezone-heading">
        <div className="form-section-heading">
          <span>04</span>
          <div>
            <h2 id="marina-timezone-heading">Operational timezone</h2>
            <p>Bookings and audit timestamps remain stored in UTC. Displays use this IANA timezone.</p>
          </div>
        </div>
        <div className="berth-form-grid berth-form-grid-two">
          <div className="form-field">
            <label htmlFor="timezone">IANA timezone</label>
            <input
              aria-describedby={describedBy(state.fieldErrors, "timezone", "timezone-help")}
              aria-invalid={Boolean(state.fieldErrors?.timezone)}
              autoComplete="off"
              defaultValue={profile.timezone}
              id="timezone"
              list="iana-timezones"
              maxLength={64}
              name="timezone"
              required
            />
            <datalist id="iana-timezones">
              {timezones.map((timezone) => <option key={timezone} value={timezone} />)}
            </datalist>
            <p className="field-help" id="timezone-help">Search by region and city, for example Europe/Riga.</p>
            <FieldError errors={state.fieldErrors} field="timezone" />
          </div>
        </div>
      </section>

      {state.message ? (
        <p className={`form-message ${state.status === "success" ? "form-success" : "form-error"}`} role={state.status === "success" ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}

      <div className="form-actions">
        <SubmitButton />
      </div>
    </form>
  );
}
