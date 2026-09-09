"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import loginStyles from "./login.module.css";
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
  const [state, action, pending] = useActionState(loginAction, initialAuthState);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form action={action} className={loginStyles.form} noValidate aria-busy={pending}>
      <input name="next" type="hidden" value={next ?? ""} />
      <div className={loginStyles.field}>
        <div className={loginStyles.labelRow}><label htmlFor="email">Work Email</label></div>
        <div className={loginStyles.inputWrap}><Mail size={16} aria-hidden="true" />
          <input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state.fieldErrors?.email)} aria-describedby={state.fieldErrors?.email ? "email-error" : undefined} />
        </div>
        {state.fieldErrors?.email ? <p className={loginStyles.fieldError} id="email-error">{state.fieldErrors.email}</p> : null}
      </div>
      <div className={loginStyles.field}>
        <div className={loginStyles.labelRow}><label htmlFor="password">Password</label><Link href="/forgot-password">Forgot password?</Link></div>
        <div className={loginStyles.inputWrap}><LockKeyhole size={16} aria-hidden="true" />
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required aria-invalid={Boolean(state.fieldErrors?.password)} aria-describedby={state.fieldErrors?.password ? "password-error" : undefined} />
          <button className={loginStyles.reveal} type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
        </div>
        {state.fieldErrors?.password ? <p className={loginStyles.fieldError} id="password-error">{state.fieldErrors.password}</p> : null}
      </div>
      <FormMessage state={state} />
      <SubmitButton>Sign In</SubmitButton>
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
