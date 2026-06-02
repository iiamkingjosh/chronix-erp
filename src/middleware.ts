import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/portal/login", "/portal/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const isDashboard = pathname.startsWith("/dashboard");
  const isPortal    = pathname.startsWith("/portal");
  const isApi       = pathname.startsWith("/api");

  if (isApi) return NextResponse.next();

  const session = request.cookies.get("__session")?.value ??
                  request.cookies.get("firebase-auth-token")?.value;

  if ((isDashboard || isPortal) && !session) {
    const loginPath = isPortal ? "/portal/login" : "/login";
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/portal/:path*",
  ],
};
