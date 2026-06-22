import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { ROLES, resolveRole, type Role } from "@/types/roles";

const BODY = z.object({
  email:       z.string().email(),
  password:    z.string().min(8),
  displayName: z.string().min(2),
  role:        z.string().min(1),
  department:  z.string().optional(),
});

/** Full provisioning: any internal role except Client; Staff may only create Staff accounts. */
const FULL_PROVISIONERS = new Set<Role>([ROLES.SYSTEM_ADMIN, ROLES.ROOT_ADMIN, ROLES.HR]);

export async function POST(request: Request) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const idToken = authHeader.slice("Bearer ".length).trim();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const callerSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!callerSnap.exists) {
      return NextResponse.json({ error: "Caller profile not found." }, { status: 403 });
    }

    const callerRole = resolveRole(String(callerSnap.data()?.role ?? ""));
    const isFullProvisioner = FULL_PROVISIONERS.has(callerRole);
    const isStaffPeerProvisioner = callerRole === ROLES.STAFF;
    if (!isFullProvisioner && !isStaffPeerProvisioner) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    const parsed = BODY.safeParse(await request.json());
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join("; ") || "Invalid body";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const email = parsed.data.email.trim();
    const { password, displayName, department } = parsed.data;
    const targetRole = resolveRole(parsed.data.role);

    if (targetRole === ROLES.CLIENT) {
      return NextResponse.json({ error: "Use the portal flow for Client accounts." }, { status: 400 });
    }

    if (isStaffPeerProvisioner && targetRole !== ROLES.STAFF) {
      return NextResponse.json(
        {
          error:
            "Staff can only create Staff accounts. Ask HR or an administrator to assign a different role or add payroll details.",
        },
        { status: 403 },
      );
    }

    if (targetRole === ROLES.ROOT_ADMIN && callerRole !== ROLES.ROOT_ADMIN) {
      return NextResponse.json({ error: "Only Root Admin may assign the Root Admin role." }, { status: 403 });
    }

    const cred = await adminAuth.createUser({ email, password, displayName });
    const now = new Date().toISOString();
    const profile = {
      uid: cred.uid,
      email,
      displayName,
      role: targetRole,
      ...(department?.trim() ? { department: department.trim() } : {}),
      createdAt: now,
      lastLoginAt: now,
    };

    await adminDb.collection("users").doc(cred.uid).set(profile);

    adminDb.collection("audit_logs").add({ actorUid: decoded.uid, actorName: callerSnap.data()?.displayName ?? "", actorRole: callerRole, action: "create", module: "users", entityId: cred.uid, entityRef: email, details: `User account created: ${displayName} (${email}) with role ${targetRole}`, timestamp: now }).catch(() => {});

    return NextResponse.json({
      uid: cred.uid,
      email,
      displayName,
      role: targetRole,
      department: department?.trim() ?? undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("email-already-exists")) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
