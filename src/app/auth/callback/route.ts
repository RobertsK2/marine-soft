import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  resolveAuthCallbackDestination,
  resolveAuthorizationForUser,
} from "@/lib/auth/authorization";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const applicationOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=invalid-callback", applicationOrigin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    captureServerError(error ?? new Error("Auth callback returned no user."), {
      operation: "auth_callback",
    });
    return NextResponse.redirect(new URL("/login?error=invalid-callback", applicationOrigin));
  }

  const context = await resolveAuthorizationForUser(
    supabase,
    data.user.id,
    data.user.email ?? null,
  );
  if (!context) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=no-membership", applicationOrigin));
  }

  return NextResponse.redirect(
    new URL(resolveAuthCallbackDestination(next), applicationOrigin),
  );
}
