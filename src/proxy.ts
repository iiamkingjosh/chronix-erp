import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Pass-through proxy (Option B): no cookie/session gate here.
 * Auth is enforced by Firebase client SDK + layouts + Firestore rules.
 * The Firebase JS SDK does not set `__session` unless you add a separate Admin cookie flow.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
