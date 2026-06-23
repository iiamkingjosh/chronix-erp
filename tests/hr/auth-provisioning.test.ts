import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import "../helpers/admin-emulator";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, signOutCurrent } from "../helpers/emulator";
import { signIn, createUserProfile } from "@/lib/auth-service";
import { auth } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { POST as createUserRoute } from "@/app/api/admin/users/create/route";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
  await signOutCurrent();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("Invariant #2 — logging in must never create an account (verifying this session's earlier fix holds)", () => {
  it("signIn() throws and signs the user back out when no Firestore profile exists for an authenticated Firebase Auth account", async () => {
    const email = `orphan-${Date.now()}@test.local`;
    const password = "test-password-123";
    // Create a real Auth account with no matching Firestore profile —
    // simulating exactly the scenario the invariant is about.
    await createUserWithEmailAndPassword(auth, email, password);
    await signOutCurrent();

    await expect(signIn(email, password)).rejects.toThrow(/no account found/i);
    expect(auth.currentUser).toBeNull(); // confirms the dangling session was cleaned up, not left half-authenticated
  });
});

describe("DEVIATION D1 — createUserProfile() is supposed to let an admin bootstrap someone else's profile, but firestore.rules don't actually allow that for anyone except Root Admin", () => {
  it("an authenticated System Admin cannot use createUserProfile to bootstrap a DIFFERENT uid's profile", async () => {
    await signInAs("System Admin");
    const targetUid = "never-registered-in-auth-" + Date.now();

    // The `users` create rule is `request.auth.uid == userId &&
    // userBootstrapCreateValid()` — strictly self-uid only, with no
    // privileged-admin clause for creating a DIFFERENT user's doc. So this
    // function's own doc comment ("Called by an admin to bootstrap a new
    // staff member") describes something the security rules don't permit,
    // for any role except Root Admin (via the catch-all).
    await expect(
      createUserProfile(targetUid, "ghost@test.local", "Ghost User", "Staff" as never)
    ).rejects.toThrow(/permission/i);

    const persisted = await readDocAsAdmin("users", targetUid);
    expect(persisted).toBeNull(); // confirmed: no profile was created — the function is non-functional for its stated purpose under any role except Root Admin
  });

  it("the only role for which createUserProfile actually works (for a third party) is Root Admin, via the rules' catch-all override", async () => {
    await signInAs("Root Admin");
    const targetUid = "ghost-created-by-root-" + Date.now();

    await createUserProfile(targetUid, "ghost2@test.local", "Ghost User 2", "Staff" as never);
    const persisted = await readDocAsAdmin("users", targetUid);
    expect(persisted).not.toBeNull();
    // ...and even here, the resulting profile is a structural orphan — a
    // Firestore doc with no matching Firebase Auth account, since this
    // function never calls into Firebase Auth at all. Nothing can ever
    // sign in as this uid; the "account" exists only on paper.
  });
});

describe("Admin user-provisioning API — role-based restrictions", () => {
  function makeRequest(body: object, token: string) {
    return new Request("http://localhost/api/admin/users/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("a Staff caller can only provision other Staff accounts, never a different role", async () => {
    const { uid: staffUid } = await signInAs("Staff");
    const idToken = await auth.currentUser!.getIdToken();

    const blocked = await createUserRoute(
      makeRequest(
        { email: `peer-${Date.now()}@test.local`, password: "password123", displayName: "Peer", role: "CFO" },
        idToken
      )
    );
    expect(blocked.status).toBe(403);

    const allowed = await createUserRoute(
      makeRequest(
        { email: `peer-${Date.now()}@test.local`, password: "password123", displayName: "Peer", role: "Staff" },
        idToken
      )
    );
    expect(allowed.status).toBe(200);
    void staffUid;
  });

  it("a System Admin caller may provision any non-Client, non-self-Root-Admin role", async () => {
    await signInAs("System Admin");
    const idToken = await auth.currentUser!.getIdToken();

    const res = await createUserRoute(
      makeRequest(
        { email: `newhire-${Date.now()}@test.local`, password: "password123", displayName: "New Hire", role: "CFO" },
        idToken
      )
    );
    expect(res.status).toBe(200);
  });
});
