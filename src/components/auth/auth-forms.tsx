"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
} from "@/app/auth/actions";
import type { AuthActionState } from "@/app/auth/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";

const initialAuthState: AuthActionState = { status: "idle" };

function Field({
  id,
  label,
  type,
  autoComplete,
  error,
}: {
  id: "email" | "password" | "confirmPassword";
  label: string;
  type: "email" | "password";
  autoComplete: string;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        id={id}
        name={id}
        required
        type={type}
      />
      {error ? <p className="field-error" id={errorId}>{error}</p> : null}
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialAuthState);
  return (
    <form action={action} className="auth-form" noValidate>
      <input name="next" type="hidden" value={next ?? ""} />
      <Field id="email" label="Email" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <div>
        <Field id="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} />
        <Link className="form-link form-link-right" href="/forgot-password">Forgot password?</Link>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Log in</SubmitButton>
      <p className="auth-note">Marina accounts are invitation-only.</p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialAuthState);
  return (
    <form action={action} className="auth-form" noValidate>
      <Field id="email" label="Email" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <FormMessage state={state} />
      <SubmitButton>Send reset link</SubmitButton>
      <p className="auth-alternative"><Link href="/login">Back to login</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initialAuthState);
  return (
    <form action={action} className="auth-form" noValidate>
      <Field id="password" label="New password" type="password" autoComplete="new-password" error={state.fieldErrors?.password} />
      <Field id="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" error={state.fieldErrors?.confirmPassword} />
      <FormMessage state={state} />
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
