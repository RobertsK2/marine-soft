import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/database";
import { resolveAuthCallbackDestination } from "@/lib/auth/authorization";
import { resolveAuthorizationForUser } from "@/lib/auth/authorization-tenant";
import { needsAdminMfa } from "@/lib/auth/mfa-policy";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next");
  const loginUrl = new URL("/login?error=invalid-callback", request.url);

  if (!tokenHash || !type) return NextResponse.redirect(loginUrl);

  const response = NextResponse.redirect(new URL("/login?error=invalid-callback", request.url));
  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const redirectWithCookies = (location: URL) => {
    response.headers.set("location", location.toString());
    return response;
  };
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return NextResponse.redirect(loginUrl);

  const context = await resolveAuthorizationForUser(
    supabase,
    data.user.id,
    data.user.email ?? null,
  );
  if (!context) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=no-membership", request.url));
  }

  const destination = resolveAuthCallbackDestination(next);
  // Only a verified recovery token may skip the dashboard MFA redirect.
  if (type === "recovery" && destination === "/reset-password") {
    return redirectWithCookies(new URL(destination, request.url));
  }

  const { data: claims } = await supabase.auth.getClaims();
  if (needsAdminMfa(context.role, claims?.claims?.aal)) {
    return redirectWithCookies(new URL(`/mfa?next=${encodeURIComponent(destination)}`, request.url));
  }

  return redirectWithCookies(new URL(destination, request.url));
}
