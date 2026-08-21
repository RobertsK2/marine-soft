import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import {
  resolveAuthCallbackDestination,
  resolveAuthorizationForUser,
} from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next");
  const loginUrl = new URL("/login?error=invalid-callback", request.url);

  if (!tokenHash || !type) return NextResponse.redirect(loginUrl);

  const supabase = await createClient();
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

  return NextResponse.redirect(
    new URL(resolveAuthCallbackDestination(next), request.url),
  );
}
