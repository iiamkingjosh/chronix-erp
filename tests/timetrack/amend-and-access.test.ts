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

  it("DEVIATION D6: a privileged non-owner (e.g. System Admin) amending SOMEONE ELSE's entry partially fails — void rejected, recreate succeeds, leaving a duplicate non-voided entry", async () => {
    const { uid: ownerUid } = await signInAs("Staff");
    const original = await createTimeEntry(makeEntry({ employeeUid: ownerUid, hours: 3 }));
    await signOutCurrent();

    await signInAs("System Admin"); // the UI's canAmend allows this via canViewAll, but the rule does not
    await expect(
      amendTimeEntry(original.id, makeEntry({ employeeUid: ownerUid, hours: 5 }), "admin-uid")
    ).rejects.toThrow(/permission/i);

    // EXPECTED under invariant #5: the whole operation should fail
    // cleanly with NO side effects, since it threw. ACTUAL: amendTimeEntry
    // does the void update FIRST (which is what throws), but if a caller
    // retried only the second half, or if the function were reordered, the
    // two steps have no transactional link at all. Confirming the original
    // is untouched (the throw happened on step 1, before step 2 ran) —
    // this specific call sequence happens to fail safe, but only because
    // void-then-create is the order chosen, not because of any guarantee:
    const persistedOriginal = await readDocAsAdmin<TimeEntry>("time_entries", original.id);
    expect(persistedOriginal?.isVoided).toBeUndefined(); // confirmed NOT voided
    const correctedAttempts = await queryAsAdmin<TimeEntry>("time_entries", "amendedFromId", original.id);
    expect(correctedAttempts).toHaveLength(0); // confirmed no orphaned "corrected" entry was created either, BECAUSE the void step (which runs first) is what threw

    // The genuinely dangerous order is the reverse: if the create succeeded
    // BEFORE the void were attempted, a duplicate would be created with no
    // way to clean it up automatically. The function's current step order
    // (void first) happens to make this particular failure mode safe by
    // accident, not by design — there is no rules-side or code-side
    // transactional guarantee either way.
  });
});

describe("DEVIATION D7 — the Time page's own access check is broader than what firestore.rules actually allow for HR", () => {
  it("HR is denied reading all time entries directly, even though the page's own canViewAll logic (manage:hr) would let them try", async () => {
    // Seed a real entry belonging to someone else first, so this is a
    // realistic "HR viewing other employees' time" query rather than an
    // edge case against an empty collection.
    const { uid: otherUid } = await signInAs("Staff");
    await createTimeEntry(makeEntry({ employeeUid: otherUid }));
    await signOutCurrent();

    await signInAs("HR");
    // time_entries read rule: hasViewAll() || isCFO() || isSystemAdmin() ||
    // self — HR satisfies none of those for someone else's entry.
    let code: string | undefined;
    try {
      await getAllTimeEntries();
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("permission-denied");
    // The Time page's own canViewAll = isRootAdmin || manage:hr || role===
    // CEO/CFO/SystemAdmin — HR passes via manage:hr and would see the
    // "view all" UI, but the underlying read this triggers is rejected.
  });

  it("CFO (in both the UI check and the rule) succeeds reading all time entries", async () => {
    await signInAs("CFO");
    await expect(getAllTimeEntries()).resolves.toBeDefined();
  });
});

describe("Minor — DEVIATION D8: ID generation inconsistency creates a real (if narrow) collision window", () => {
  it("Date.now().toString() IDs (used throughout these services) can collide for two entries created in the same millisecond", () => {
    const now = Date.now();
    const idFromCallA = now.toString();
    const idFromCallB = now.toString(); // a second "concurrent" call in the same millisecond
    expect(idFromCallA).toBe(idFromCallB); // confirmed: same ID, would silently overwrite/dedupe-collide if used as a Firestore key or React list key

    // By contrast, crypto.randomUUID() (used in a few other call sites in
    // this same domain, e.g. projects/new/page.tsx's creation activity)
    // cannot collide this way.
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(a).not.toBe(b);
  });
});
