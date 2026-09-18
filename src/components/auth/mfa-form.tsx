"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { id: string; qr: string; secret: string };

export function MfaForm({ next }: { next: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("Authenticator status could not be loaded. Reload this page.");
      else setFactorId(data.totp[0]?.id ?? null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [supabase]);

  async function beginEnrollment() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Berthio admin" });
    if (error || !data?.totp) setMessage("Authenticator setup could not start. Try again.");
    else setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setBusy(false);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = enrollment?.id ?? factorId;
    if (!id || !/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error) {
      setMessage("The code could not be verified. Check the current code and try again.");
      setCode("");
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  if (loading) return <p role="status">Loading authenticator status…</p>;
  return <div>
    {!factorId && !enrollment ? <div>
      <p>Set up an authenticator app before accessing marina administration.</p>
      <button className="button button-primary" disabled={busy} onClick={beginEnrollment} type="button">Set up authenticator</button>
    </div> : null}
    {enrollment ? <div>
      <p>Scan this code with your authenticator app. Keep the setup key private.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns a per-enrollment data URI. */}
      <img alt="Authenticator setup QR code" height={180} src={enrollment.qr} width={180} />
      <p>Manual setup key: <code>{enrollment.secret}</code></p>
    </div> : null}
    {factorId || enrollment ? <form onSubmit={verify}>
      <label htmlFor="mfa-code">Authenticator code</label>
      <input autoComplete="one-time-code" id="mfa-code" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value)} pattern="[0-9]{6}" required value={code} />
      <button className="button button-primary" disabled={busy} type="submit">Verify and continue</button>
    </form> : null}
    {message ? <p role="alert">{message}</p> : null}
    <p>If your authenticator is unavailable, contact your pilot access administrator. Admin access stays blocked until the factor is recovered or reset.</p>
  </div>;
}
