import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

/** Removes one specific token from push_tokens/{uid}.tokens - not the
 * whole array. The schema supports multiple tokens per uid (multiple
 * devices/browsers can each register their own), so logging out on one
 * device must only drop that device's token, leaving any others intact. */
export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { token } = await req.json() as { token?: string };
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const uid     = decoded.uid;
    const db      = getAdminDb();

    const ref      = db.collection("push_tokens").doc(uid);
    const snap     = await ref.get();
    const existing: string[] = snap.exists ? (snap.data()?.tokens ?? []) : [];
    if (existing.includes(token)) {
      await ref.set({ tokens: existing.filter((t) => t !== token), updatedAt: new Date().toISOString() });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications/unregister-token] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
