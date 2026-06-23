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

describe("DEVIATION D5 — UI gate shows CFO a button that firestore.rules will reject", () => {
  it("CFO is rejected updating an asset's status, even though the assets list page's UI gate includes CFO", async () => {
    await signInAs("System Admin");
    const asset = await createAsset({
      name: "Test Laptop", category: "laptop", status: "available",
      condition: "good", assignmentHistory: [], createdAt: new Date().toISOString(), createdBy: "test-uid",
    } as never);
    await signOutCurrent();

    await signInAs("CFO");
    // assets create/update rule: isSystemAdmin()||isCEO()||canManageHR()||isITManager() — CFO is in none of those.
    await expect(updateAssetStatus(asset.id, "decommissioned")).rejects.toThrow(/permission/i);
  });
});

describe("DEVIATION D5 (mirror image) — rules grant IT Manager write access that three separate UI pages never expose a button for", () => {
  it("IT Manager CAN write to knowledge_base per rules, even though knowledge/page.tsx's gate omits IT Manager", async () => {
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

  it("IT Manager CAN update change_log status per rules, even though changes/page.tsx's approval gate omits IT Manager", async () => {
    await signInAs("System Admin");
    const change = await createChange({
      changeRef: `CHG-MISMATCH-${Date.now()}`, title: "Test", description: "test",
      type: "standard", risk: "low", status: "pending_approval",
      requestedBy: "x", requestedByUid: "x", affectedSystems: "x", rollbackPlan: "x",
      createdAt: new Date().toISOString(),
    } as never);
    await signOutCurrent();

    await signInAs("IT Manager");
    await expect(updateChangeStatus(change.id, "approved", "Test IT Manager")).resolves.toBeUndefined();
  });

  it("IT Manager CAN create on-call schedule slots per rules, even though oncall/page.tsx's gate (isRootAdmin||manage:hr||SystemAdmin) omits IT Manager", async () => {
    await signInAs("IT Manager");
    await expect(
      createOnCallSlot({
        weekStart: "2026-07-06", weekEnd: "2026-07-12",
        engineerUid: "test-uid", engineerName: "Test Engineer",
        createdBy: "test-uid", createdAt: new Date().toISOString(),
      } as never)
    ).resolves.toBeDefined();
  });
});
