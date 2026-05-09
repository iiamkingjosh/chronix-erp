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

/** Matches setup page: elevated operators only (manage:settings is System Admin). */
const CAN_CREATE_USERS = new Set<Role>([ROLES.SYSTEM_ADMIN, ROLES.ROOT_ADMIN]);

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
    if (!CAN_CREATE_USERS.has(callerRole)) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    const parsed = BODY.safeParse(await request.json());
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join("; ") || "Invalid body";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { email, password, displayName, department } = parsed.data;
    const targetRole = resolveRole(parsed.data.role);

    if (targetRole === ROLES.CLIENT) {
      return NextResponse.json({ error: "Use the portal flow for Client accounts." }, { status: 400 });
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
