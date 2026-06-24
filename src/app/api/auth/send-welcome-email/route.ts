import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendEmail, welcomeEmail } from "@/lib/email-service";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`welcome-email:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Welcome email is a nice-to-have, not a critical path — this route
  // always returns { success: true } regardless of what happens below
  // (same anti-enumeration-style shape as send-password-reset), so a
  // Resend hiccup can never surface as a registration failure. Real
  // failures are still logged server-side, not silently dropped.
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ success: true });

    const decoded  = await getAdminAuth().verifyIdToken(idToken);
    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();
    const user = userSnap.data();

    const email       = (user?.email ?? decoded.email) as string | undefined;
    const displayName = (user?.displayName ?? email ?? "there") as string;
    const role        = (user?.role ?? "Staff") as string;

    if (email) {
      const result = await sendEmail([email], "Welcome to Chronix OS", welcomeEmail(displayName, role));
      if (!result.sent) {
        console.error("[send-welcome-email] sendEmail failed for", email, ":", result.error ?? result.skipped);
      }
    }
  } catch (err) {
    console.error("[send-welcome-email] error:", err);
  }

  return NextResponse.json({ success: true });
}
