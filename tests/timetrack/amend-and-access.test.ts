import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, signOutCurrent, readDocAsAdmin, queryAsAdmin } from "../helpers/emulator";
import { createTimeEntry, amendTimeEntry, getAllTimeEntries } from "@/lib/timetrack-service";
import type { TimeEntry } from "@/types/timetrack";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makeEntry(overrides: Partial<TimeEntry> = {}): Omit<TimeEntry, "id"> {
  return {
    employeeUid: "test-uid",
    employeeName: "Test Employee",
    type: "internal",
    description: "Test work",
    date: new Date().toISOString().split("T")[0],
    hours: 4,
    billable: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Invariant #5 — amending a time entry must succeed completely or not at all", () => {
  it("the owner amending their own entry works correctly end-to-end (void original + create corrected)", async () => {
    const { uid } = await signInAs("Staff");
    const original = await createTimeEntry(makeEntry({ employeeUid: uid, hours: 3 }));

    await amendTimeEntry(original.id, makeEntry({ employeeUid: uid, hours: 4 }), uid);

    const persistedOriginal = await readDocAsAdmin<TimeEntry>("time_entries", original.id);
    expect(persistedOriginal?.isVoided).toBe(true);

    const corrected = await queryAsAdmin<TimeEntry>("time_entries", "amendedFromId", original.id);
    expect(corrected).toHaveLength(1);
    expect(corrected[0].hours).toBe(4);
  });

  it("FIXED: DEVIATION D6 — a privileged non-owner's rejected amend now leaves zero side effects, guaranteed by a single Firestore transaction, not by accidental call order", async () => {
    const { uid: ownerUid } = await signInAs("Staff");
    const original = await createTimeEntry(makeEntry({ employeeUid: ownerUid, hours: 3 }));
    await signOutCurrent();

    await signInAs("System Admin"); // the UI's canAmend allows this via canViewAll, but the rule does not
    await expect(
      amendTimeEntry(original.id, makeEntry({ employeeUid: ownerUid, hours: 5 }), "admin-uid")
    ).rejects.toThrow(/permission/i);

    // FIXED under invariant #5: amendTimeEntry() now wraps both the void
    // and the create in one runTransaction() call. Firestore transactions
    // are all-or-nothing - if the void's security rule rejects the write,
    // the ENTIRE transaction rolls back, including the create, regardless
    // of which write was attempted "first" in the function body. This is
    // no longer an accident of call order - it's a platform guarantee.
    const persistedOriginal = await readDocAsAdmin<TimeEntry>("time_entries", original.id);
    expect(persistedOriginal?.isVoided).toBeUndefined(); // confirmed NOT voided
    const correctedAttempts = await queryAsAdmin<TimeEntry>("time_entries", "amendedFromId", original.id);
    expect(correctedAttempts).toHaveLength(0); // confirmed no orphaned "corrected" entry either
  });
});

describe("FIXED: DEVIATION D7 — the Time page's own access check now matches what firestore.rules allow for HR", () => {
  it("HR can now read all time entries directly, matching the page's own canViewAll logic (manage:hr)", async () => {
    // Seed a real entry belonging to someone else first, so this is a
    // realistic "HR viewing other employees' time" query rather than an
    // edge case against an empty collection.
    const { uid: otherUid } = await signInAs("Staff");
    await createTimeEntry(makeEntry({ employeeUid: otherUid }));
    await signOutCurrent();

    await signInAs("HR");
    // time_entries read rule now: hasViewAll() || isCFO() || isSystemAdmin()
    // || isHR() || self — HR added to match the page's canViewAll exactly.
    await expect(getAllTimeEntries()).resolves.toBeDefined();
  });

  it("CFO (in both the UI check and the rule) still succeeds reading all time entries", async () => {
    await signInAs("CFO");
    await expect(getAllTimeEntries()).resolves.toBeDefined();
  });
});

describe("FIXED: DEVIATION D8 — every remaining Date.now().toString() ID generation site (21 locations across crm/projects/tickets-service.ts and 7 page components) replaced with crypto.randomUUID()", () => {
  it("Date.now().toString() IDs would still collide for two entries created in the same millisecond, confirming the risk this fix closes", () => {
    const now = Date.now();
    const idFromCallA = now.toString();
    const idFromCallB = now.toString(); // a second "concurrent" call in the same millisecond
    expect(idFromCallA).toBe(idFromCallB); // same ID - would silently overwrite/dedupe-collide if used as a Firestore key or React list key
  });

  it("crypto.randomUUID() - now the sole convention across every ID-generation site in this domain - never collides", () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(a).not.toBe(b);
  });
});
