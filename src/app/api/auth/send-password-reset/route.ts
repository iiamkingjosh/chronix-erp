import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { sendEmail, passwordResetEmail } from "@/lib/email-service";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`pwreset:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body  = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    const link = await getAdminAuth().generatePasswordResetLink(email);
    await sendEmail([email], "Reset your Chronix ERP password", passwordResetEmail(link));
  } catch (e) {
    const code = (e as { code?: string })?.code;
    // Anti-enumeration: never reveal whether the account exists — always
    // return success below, same as Firebase's own sendPasswordResetEmail.
    // Genuine failures (Resend down, Admin SDK error) are still logged here
    // so they're not invisible the way the Finance module's swallows were.
    if (code !== "auth/user-not-found") {
      console.error("[send-password-reset] failed for", email, ":", e);
    }
  }

  return NextResponse.json({ success: true });
}
