import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const ALLOWED_ROLES = new Set(["System Admin"]);

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const idToken = authHeader.slice("Bearer ".length).trim();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const callerRef = adminDb.collection("users").doc(decoded.uid);
    const callerSnap = await callerRef.get();
    if (!callerSnap.exists) {
      return NextResponse.json({ error: "Caller profile not found." }, { status: 403 });
    }

    const callerRole = callerSnap.data()?.role;
    if (!ALLOWED_ROLES.has(callerRole)) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    const { uid } = await context.params;
    if (!uid) {
      return NextResponse.json({ error: "Missing target user id." }, { status: 400 });
    }

    if (uid === decoded.uid) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    const usersRef = adminDb.collection("users").doc(uid);
    const legacyEmployeesRef = adminDb.collection("employees").doc(uid);
    await Promise.allSettled([usersRef.delete(), legacyEmployeesRef.delete()]);
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
