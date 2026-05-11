import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { token } = await req.json() as { token?: string };
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    await getAdminDb()
      .collection("users")
      .doc(decoded.uid)
      .update({ fcmTokens: FieldValue.arrayUnion(token) });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications/register-token] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
