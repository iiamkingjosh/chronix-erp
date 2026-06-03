import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/portal/login",
  "/portal/register",
];

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname } = url;

  // Strip credential query params from login URLs before anything else.
  if (
    (pathname === "/login" || pathname === "/portal/login") &&
    (url.searchParams.has("password") || url.searchParams.has("email"))
  ) {
    url.searchParams.delete("password");
    url.searchParams.delete("email");
    return NextResponse.redirect(url);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const isApi       = pathname.startsWith("/api");
  const isDashboard = pathname.startsWith("/dashboard");
  const isPortal    = pathname.startsWith("/portal");

  if (isApi) return NextResponse.next();

  const session =
    request.cookies.get("__session")?.value ??
    request.cookies.get("firebase-auth-token")?.value;

  if ((isDashboard || isPortal) && !session) {
    const loginPath = isPortal ? "/portal/login" : "/login";
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
