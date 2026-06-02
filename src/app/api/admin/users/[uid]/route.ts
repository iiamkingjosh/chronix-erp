import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { ROLES, resolveRole, type Role } from "@/types/roles";
import { isRateLimited } from "@/lib/rate-limit";

const ALLOWED_ROLES = new Set<Role>([ROLES.SYSTEM_ADMIN, ROLES.ROOT_ADMIN]);

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uid: string }> }
) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`admin:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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

    const callerRole = resolveRole(String(callerSnap.data()?.role ?? ""));
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
    const targetSnap = await adminDb.collection("users").doc(uid).get();
    const targetName = (targetSnap.data()?.displayName ?? targetSnap.data()?.email ?? uid) as string;
    await Promise.allSettled([usersRef.delete(), legacyEmployeesRef.delete()]);
    await adminAuth.deleteUser(uid);

    adminDb.collection("audit_logs").add({ actorUid: decoded.uid, actorName: callerSnap.data()?.displayName ?? "", actorRole: callerRole, action: "delete", module: "users", entityId: uid, entityRef: targetName, details: `User account deleted: ${targetName}`, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
