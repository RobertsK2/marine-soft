import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isProtectedPath } from "@/lib/auth/authorization";
import { updateSession } from "@/lib/supabase/proxy";
import {
  ANONYMOUS_BOOKING_COOKIE,
  ANONYMOUS_BOOKING_TOKEN_PATTERN,
  createAnonymousBookingToken,
} from "@/domain/booking-holds/anonymous-session";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/marina/")) {
    const existing = request.cookies.get(ANONYMOUS_BOOKING_COOKIE)?.value;
    const token = existing && ANONYMOUS_BOOKING_TOKEN_PATTERN.test(existing)
      ? existing
      : createAnonymousBookingToken();
    request.cookies.set(ANONYMOUS_BOOKING_COOKIE, token);
    const response = NextResponse.next({ request });
    if (token !== existing) {
      response.cookies.set(ANONYMOUS_BOOKING_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/marina",
        maxAge: 60 * 60 * 24,
      });
    }
    return response;
  }

  const { response, userId } = await updateSession(request);

  if (!userId && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/marina/:path*"],
};
