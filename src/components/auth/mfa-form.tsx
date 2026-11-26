"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Copy, CopyCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./mfa.module.css";

type Enrollment = { id: string; qr: string; secret: string };
type Initialization =
  | { factorId: string }
  | { enrollment: Enrollment }
  | { pendingFactorIds: string[] }
  | { message: string };

const ENROLLMENT_STORAGE_KEY = "berthio:mfa-enrollment";
const CODE_LENGTH = 6;

function getCodeSlot(input: HTMLInputElement) {
  return Math.min(input.selectionStart ?? 0, CODE_LENGTH - 1);
}

function readStoredEnrollment(): Enrollment | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ENROLLMENT_STORAGE_KEY) ?? "null") as Partial<Enrollment> | null;
    return parsed && typeof parsed.id === "string" && typeof parsed.qr === "string" && typeof parsed.secret === "string"
      ? { id: parsed.id, qr: parsed.qr, secret: parsed.secret }
      : null;
  } catch {
    return null;
  }
}

export function MfaForm({ next, identity }: { next: string; identity: string }) {
  const supabase = useMemo(() => createClient(), []);
  const initializationRef = useRef<Promise<Initialization> | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [pendingFactorIds, setPendingFactorIds] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [activeSlot, setActiveSlot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!initializationRef.current) {
      initializationRef.current = (async (): Promise<Initialization> => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) return { message: "Authenticator status could not be loaded. Sign out and try again." };

        const verifiedFactor = data.totp[0];
        if (verifiedFactor) {
          sessionStorage.removeItem(ENROLLMENT_STORAGE_KEY);
          return { factorId: verifiedFactor.id };
        }

        const pendingFactors = data.all.filter((factor) => factor.factor_type === "totp" && factor.status === "unverified");
        const storedEnrollment = readStoredEnrollment();
        if (storedEnrollment && pendingFactors.some((factor) => factor.id === storedEnrollment.id)) {
          return { enrollment: storedEnrollment };
        }
        sessionStorage.removeItem(ENROLLMENT_STORAGE_KEY);
        if (pendingFactors.length > 0) return { pendingFactorIds: pendingFactors.map((factor) => factor.id) };

        const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Berthio admin",
        });
        if (enrollError || !enrolled?.totp) {
          return { message: "Authenticator setup could not start. Sign out and try again." };
        }
        const newEnrollment = { id: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret };
        sessionStorage.setItem(ENROLLMENT_STORAGE_KEY, JSON.stringify(newEnrollment));
        return { enrollment: newEnrollment };
      })();
    }

    let active = true;
    initializationRef.current.then((result) => {
      if (!active) return;
      if ("message" in result) setMessage(result.message);
      else if ("factorId" in result) setFactorId(result.factorId);
      else if ("enrollment" in result) setEnrollment(result.enrollment);
      else setPendingFactorIds(result.pendingFactorIds);
      setLoading(false);
    });
    return () => { active = false; };
  }, [supabase]);

  async function copyManualKey() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopyStatus("Manual key copied.");
    } catch {
      setCopyStatus("Copy was unavailable. Select the manual key to copy it.");
    }
  }

  async function restartEnrollment() {
    if (busy || pendingFactorIds.length === 0) return;
    setBusy(true);
    setMessage(null);
    for (const id of pendingFactorIds) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) {
        setMessage("The unfinished setup could not be cleared. Contact your pilot access administrator.");
        setBusy(false);
        return;
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Berthio admin" });
    if (error || !data?.totp) {
      setMessage("Authenticator setup could not restart. Sign out and try again.");
      setBusy(false);
      return;
    }
    const newEnrollment = { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    sessionStorage.setItem(ENROLLMENT_STORAGE_KEY, JSON.stringify(newEnrollment));
    setPendingFactorIds([]);
    setEnrollment(newEnrollment);
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
    sessionStorage.removeItem(ENROLLMENT_STORAGE_KEY);
    window.location.assign(next);
  }

  function selectCodeSlot(input: HTMLInputElement, index: number) {
    // A native text field can select an existing digit or place the caret after it.
    const slot = Math.min(Math.max(index, 0), input.value.length, CODE_LENGTH - 1);
    input.setSelectionRange(slot, Math.min(slot + 1, input.value.length));
    setActiveSlot(slot);
  }

  function updateCode(input: HTMLInputElement) {
    const caret = input.selectionStart ?? input.value.length;
    if (/\D/.test(input.value)) {
      const position = input.value.slice(0, caret).replace(/\D/g, "").length;
      input.value = code;
      selectCodeSlot(input, position);
      return;
    }

    setCode(input.value.slice(0, CODE_LENGTH));
    setMessage(null);
    if (caret < input.value.length) selectCodeSlot(input, caret);
    else setActiveSlot(getCodeSlot(input));
  }

  const setupMode = Boolean(enrollment);
  const title = setupMode ? "Set up two-factor authentication" : "Two-factor authentication";

  if (loading) return <div className={styles.content}>
    <h1 className={styles.title}>Two-factor authentication</h1>
    <p className={styles.loading} role="status">Preparing your authenticator setup…</p>
  </div>;

  if (pendingFactorIds.length > 0) return <div className={styles.content}>
    <h1 className={styles.title}>Set up two-factor authentication</h1>
    {identity ? <p className={styles.identity}>{identity}</p> : null}
    <p className={styles.description}>An unfinished authenticator setup already exists. Restart it to generate a new QR code and manual key.</p>
    <button className={styles.submit} disabled={busy} onClick={restartEnrollment} type="button">
      {busy ? "Restarting…" : "Restart setup"}
    </button>
    {message ? <p className={styles.message} role="alert">{message}</p> : null}
  </div>;

  if (!factorId && !enrollment) return <div className={styles.content}>
    <h1 className={styles.title}>Two-factor authentication</h1>
    {identity ? <p className={styles.identity}>{identity}</p> : null}
    {message ? <p className={styles.message} role="alert">{message}</p> : null}
  </div>;

  return <div className={styles.content}>
    <h1 className={styles.title}>{title}</h1>
    {identity ? <p className={styles.identity}>{identity}</p> : null}
    {setupMode ? <>
      <p className={styles.description}>Scan the QR code with your authenticator app.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the per-enrollment QR code as a data URI. */}
      <img className={styles.qr} alt="Authenticator setup QR code" height={140} src={enrollment!.qr} width={140} />
      <p className={styles.manualKey}>
        <span>Manual key:</span>
        <code>{enrollment!.secret}</code>
        <button className={styles.copyButton} onClick={copyManualKey} type="button" aria-label="Copy manual setup key">
          {copyStatus === "Manual key copied." ? <CopyCheck size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copyStatus === "Manual key copied." ? "Copied" : "Copy"}
        </button>
      </p>
    </> : <p className={styles.description}>Enter the 6-digit code from your authenticator app.</p>}

    <form onSubmit={verify}>
      <div className={styles.codeField}>
        <label className={styles.visuallyHidden} htmlFor="mfa-code">Authenticator code</label>
        <div className={styles.codeSlots}>
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <span
              aria-hidden="true"
              className={styles.codeSlot}
              data-active={index === Math.min(activeSlot, code.length) ? "" : undefined}
              key={index}
            >
              {code[index] ?? ""}
            </span>
          ))}
          <input
            autoComplete="one-time-code"
            className={styles.codeInput}
            id="mfa-code"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            name="code"
            onChange={(event) => updateCode(event.currentTarget)}
            onClick={(event) => {
              if (event.detail !== 1) return;
              const input = event.currentTarget;
              const { left, width } = input.getBoundingClientRect();
              const slot = Math.floor((event.clientX - left) / (width / CODE_LENGTH));
              selectCodeSlot(input, slot);
            }}
            onFocus={(event) => setActiveSlot(getCodeSlot(event.currentTarget))}
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const input = event.currentTarget;
              selectCodeSlot(input, getCodeSlot(input) + (event.key === "ArrowLeft" ? -1 : 1));
            }}
            onPaste={(event) => {
              const digits = event.clipboardData.getData("text").replace(/\D/g, "");
              if (digits.length !== CODE_LENGTH) return;
              event.preventDefault();
              const input = event.currentTarget;
              input.setRangeText(digits, 0, input.value.length, "end");
              updateCode(input);
            }}
            onSelect={(event) => setActiveSlot(getCodeSlot(event.currentTarget))}
            pattern="[0-9]{6}"
            required
            type="text"
            value={code}
            aria-describedby="mfa-code-hint"
          />
        </div>
        <span className={styles.visuallyHidden} id="mfa-code-hint">Enter the six-digit code from your authenticator app.</span>
      </div>
      <button className={styles.submit} disabled={busy || code.length !== 6} type="submit">
        {busy ? "Verifying…" : setupMode ? "Enable two-factor" : "Verify"}
      </button>
    </form>
    {message ? <p className={styles.message} role="alert">{message}</p> : null}
    {copyStatus ? <p className={styles.status} role="status">{copyStatus}</p> : null}
    <p className={styles.help}>
      <span>Having trouble?</span>
      <span>Contact your pilot access administrator.</span>
    </p>
  </div>;
}
