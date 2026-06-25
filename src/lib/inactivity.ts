/** Passes the "why were you logged out" reason across the redirect to
 * /login or /portal/login. sessionStorage (not a query param) because the
 * redirect itself is already handled generically by ProtectedRoute once
 * firebaseUser/profile go null — adding a query param here would race
 * against that redirect's own router.replace("/login") call. */
const KEY = "chronix:logoutReason";

export function markLoggedOutForInactivity(): void {
  try {
    sessionStorage.setItem(KEY, "inactivity");
  } catch {
    /* sessionStorage unavailable (e.g. private browsing) — non-fatal,
       the user just won't see the explanatory message. */
  }
}

/** Reads and clears the flag in one call so the message shows exactly
 * once, not on every subsequent visit to the login page. */
export function consumeInactivityLogoutFlag(): boolean {
  try {
    const wasInactivity = sessionStorage.getItem(KEY) === "inactivity";
    if (wasInactivity) sessionStorage.removeItem(KEY);
    return wasInactivity;
  } catch {
    return false;
  }
}
