import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Pass-through proxy (Option B): no cookie/session gate here.
 * Auth is enforced by Firebase client SDK + layouts + Firestore rules.
 * The Firebase JS SDK does not set `__session` unless you add a separate Admin cookie flow.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Defense-in-depth: never allow credential query params to persist in URLs.
  if ((url.pathname === "/login" || url.pathname === "/portal/login") &&
      (url.searchParams.has("password") || url.searchParams.has("email"))) {
    url.searchParams.delete("password");
    url.searchParams.delete("email");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
