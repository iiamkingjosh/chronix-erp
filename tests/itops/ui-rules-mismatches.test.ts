import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, signOutCurrent } from "../helpers/emulator";
import { createAsset, updateAssetStatus } from "@/lib/asset-service";
import { createArticle, updateArticleStatus } from "@/lib/knowledge-service";
import { createChange, updateChangeStatus } from "@/lib/change-service";
import { createOnCallSlot } from "@/lib/oncall-service";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("FIXED: DEVIATION D5 (1/5) — assets/page.tsx no longer shows CFO a button firestore.rules would reject", () => {
  it("CFO is still rejected updating an asset's status - the rule was already correct, only the UI gate changed (removed CFO, not widened the rule)", async () => {
    await signInAs("System Admin");
    const asset = await createAsset({
      name: "Test Laptop", category: "laptop", status: "available",
      condition: "good", assignmentHistory: [], createdAt: new Date().toISOString(), createdBy: "test-uid",
    } as never);
    await signOutCurrent();

    await signInAs("CFO");
    // assets create/update rule, unchanged: isSystemAdmin()||isCEO()||canManageHR()||isITManager() — CFO is in none of those.
    await expect(updateAssetStatus(asset.id, "decommissioned")).rejects.toThrow(/permission/i);
  });
});

describe("FIXED: DEVIATION D5 (2/5, 3/5, 4/5, 5/5) — knowledge_base/change_log/oncall_schedule UI gates now match what the rules have always allowed", () => {
  it("IT Manager's write to knowledge_base succeeds against the real rule (now also reachable via the UI, previously rule-only)", async () => {
    await signInAs("IT Manager");
    await expect(
      createArticle({
        title: "Test Article", content: "Test content", category: "other",
        status: "draft", tags: [], isPublic: false,
        authorUid: "test-uid", authorName: "Test IT Manager",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), viewCount: 0,
      } as never)
    ).resolves.toBeDefined();
  });

  it("IT Manager's change_log approval succeeds against the real rule (now also reachable via the UI)", async () => {
    await signInAs("System Admin");
    const change = await createChange({
      changeRef: `CHG-MISMATCH-${Date.now()}`, title: "Test", description: "test",
      type: "standard", risk: "low", status: "pending_approval",
      requestedBy: "x", requestedByUid: "x", affectedSystems: "x", rollbackPlan: "x",
      createdAt: new Date().toISOString(),
    } as never);
    await signOutCurrent();

    const { uid: itMgrUid } = await signInAs("IT Manager");
    await expect(
      updateChangeStatus(change.id, "approved", { uid: itMgrUid, name: "Test IT Manager", role: "IT Manager" })
    ).resolves.toBeUndefined();
  });

  it("IT Manager's on-call schedule creation succeeds against the real rule (now also reachable via the UI)", async () => {
    await signInAs("IT Manager");
    await expect(
      createOnCallSlot({
        weekStart: "2026-07-06", weekEnd: "2026-07-12",
        engineerUid: "test-uid", engineerName: "Test Engineer",
        createdBy: "test-uid", createdAt: new Date().toISOString(),
      } as never)
    ).resolves.toBeDefined();
  });

  it("CEO's on-call schedule creation succeeds against the real rule - the incidental 5th gap found alongside IT Manager's", async () => {
    await signInAs("CEO");
    await expect(
      createOnCallSlot({
        weekStart: "2026-07-13", weekEnd: "2026-07-19",
        engineerUid: "test-uid-2", engineerName: "Test Engineer 2",
        createdBy: "test-uid", createdAt: new Date().toISOString(),
      } as never)
    ).resolves.toBeDefined();
  });
});
