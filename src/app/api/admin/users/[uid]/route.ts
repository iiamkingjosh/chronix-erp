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

    const usersRef       = adminDb.collection("users").doc(uid);
    const employeesRef   = adminDb.collection("employees").doc(uid);
    const pushTokenRef   = adminDb.collection("push_tokens").doc(uid);
    const targetSnap      = await usersRef.get();
    const targetName      = (targetSnap.data()?.displayName ?? targetSnap.data()?.email ?? uid) as string;

    // Dangling-reference cleanup — assignedTo only, never createdBy/
    // approvedBy/submittedBy (those are historical attribution on
    // invoices/expenses/payroll/journal entries/audit logs and must stay
    // untouched regardless of whether the account still exists).
    const [ticketsSnap, projectsSnap, leadsSnap] = await Promise.all([
      adminDb.collection("tickets").where("assignedTo", "==", uid).get(),
      adminDb.collection("projects").where("assignedTo", "==", uid).get(),
      adminDb.collection("leads").where("assignedTo", "==", uid).get(),
    ]);

    // Single atomic batch: every Firestore write below either all commits
    // together or none of it does. If it fails, the Auth account deletion
    // below is never attempted — no more silently proceeding past a
    // half-failed cleanup the way the old Promise.allSettled did.
    const batch = adminDb.batch();
    batch.delete(usersRef);
    batch.delete(employeesRef);
    batch.delete(pushTokenRef);
    for (const doc of ticketsSnap.docs)  batch.update(doc.ref, { assignedTo: "", assignedName: "Unassigned" });
    for (const doc of projectsSnap.docs) batch.update(doc.ref, { assignedTo: "" });
    for (const doc of leadsSnap.docs)    batch.update(doc.ref, { assignedTo: "", assignedName: "Unassigned" });

    try {
      await batch.commit();
    } catch (batchError) {
      console.error("[admin/users DELETE] Firestore batch failed, Auth account untouched:", batchError);
      const detail = batchError instanceof Error ? batchError.message : String(batchError);
      return NextResponse.json({
        error: `Failed to delete Firestore records (users/employees/push_tokens/assignments) — ${detail}. The Auth account was NOT touched; nothing was deleted.`,
      }, { status: 500 });
    }

    try {
      await adminAuth.deleteUser(uid);
    } catch (authError) {
      console.error("[admin/users DELETE] Firestore batch succeeded but deleteUser failed — partial state:", authError);
      const detail = authError instanceof Error ? authError.message : String(authError);
      return NextResponse.json({
        error: `Firestore records were deleted, but the Auth account could NOT be removed (${detail}). This account is now in a partial state — retry the delete to remove the remaining Auth account.`,
      }, { status: 500 });
    }

    adminDb.collection("audit_logs").add({ actorUid: decoded.uid, actorName: callerSnap.data()?.displayName ?? "", actorRole: callerRole, action: "delete", module: "users", entityId: uid, entityRef: targetName, details: `User account deleted: ${targetName} (cleared ${ticketsSnap.size} ticket, ${projectsSnap.size} project, ${leadsSnap.size} lead assignment(s))`, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user.";
    // Diagnostic only — this route previously caught and returned the
    // message with nothing logged server-side, leaving no trace to debug
    // a real production failure from. Logging the full error (not just
    // .message) since credentials-library errors often carry .code/.name
    // with more structured detail than the message string alone.
    console.error("[admin/users DELETE] failed:", error, {
      code: (error as { code?: string })?.code,
      name: (error as { name?: string })?.name,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
