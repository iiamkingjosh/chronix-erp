import type { ChronixUser, Role } from "@/types/roles";

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  department?: string;
}

/**
 * Creates a Firebase Auth user + Firestore profile via Admin SDK.
 * Caller must pass a fresh ID token from an authenticated System Admin or Root Admin session.
 */
export async function createStaffUser(idToken: string, input: CreateUserInput): Promise<ChronixUser> {
  const res = await fetch("/api/admin/users/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const err = body.error;
    const msg =
      typeof err === "string"
        ? err
        : err && typeof err === "object"
          ? JSON.stringify(err)
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  const now = new Date().toISOString();
  return {
    uid: String(body.uid ?? ""),
    email: String(body.email ?? ""),
    displayName: String(body.displayName ?? ""),
    role: body.role as Role,
    department: typeof body.department === "string" ? body.department : undefined,
    createdAt: now,
    lastLoginAt: now,
  };
}
