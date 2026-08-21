"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  resolveAuthorizationForUser,
  resolveDashboardDestination,
} from "@/lib/auth/authorization";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "confirmPassword", string>>;
};

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCredentials(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const fieldErrors: AuthActionState["fieldErrors"] = {};

  if (!validateEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";

  return { email, password, fieldErrors };
}

async function getRequestOrigin() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) return new URL(configuredSiteUrl).origin;

  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");

  if (!/^[a-z0-9.:[\]-]+$/i.test(host) || !["http", "https"].includes(protocol)) {
    throw new Error("Unable to determine a safe application origin.");
  }
  return `${protocol}://${host}`;
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, password, fieldErrors } = validateCredentials(formData);
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { status: "error", message: "Email or password is incorrect." };
  }

  try {
    const context = await resolveAuthorizationForUser(
      supabase,
      data.user.id,
      data.user.email ?? null,
    );

    if (!context) {
      await supabase.auth.signOut();
      return {
        status: "error",
        message: "This account does not have an active marina membership.",
      };
    }
  } catch (authorizationError) {
    await supabase.auth.signOut();
    captureServerError(authorizationError, { operation: "login_membership_resolution" });
    return {
      status: "error",
      message: "Marina access could not be verified. Try again.",
    };
  }

  redirect(resolveDashboardDestination(value(formData, "next")));
}

export async function forgotPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email").toLowerCase();
  if (!validateEmail(email)) {
    return { status: "error", fieldErrors: { email: "Enter a valid email address." } };
  }

  const supabase = await createClient();
  const origin = await getRequestOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) captureServerError(error, { operation: "password_reset_request" });

  return {
    status: "success",
    message: "If an invited account exists for that email, a reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  const fieldErrors: AuthActionState["fieldErrors"] = {};

  if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";
  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    captureServerError(error, { operation: "password_update" });
    return {
      status: "error",
      message: "This reset session is invalid or expired. Request a new link.",
    };
  }

  redirect("/login?message=password-updated");
}

export async function logoutAction() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    const { error } = await supabase.auth.signOut();
    if (error) captureServerError(error, { operation: "logout" });
  }
  redirect("/login");
}
