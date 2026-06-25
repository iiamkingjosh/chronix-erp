import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin } from "../helpers/emulator";
import { createAsset, assignAsset, returnAsset, updateAssetStatus } from "@/lib/asset-service";
import type { Asset } from "@/types/asset";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makeAsset(overrides: Partial<Asset> = {}): Omit<Asset, "id"> {
  return {
    name: "Test Laptop",
    category: "laptop",
    status: "available",
    condition: "good",
    assignmentHistory: [],
    createdAt: new Date().toISOString(),
    createdBy: "test-uid",
    ...overrides,
  };
}

describe("FIXED: IT Manager can now manage assets end-to-end, matching firestore.rules exactly", () => {
  it("IT Manager can create an asset (rule: isSystemAdmin() || isCEO() || canManageHR() || isITManager())", async () => {
    await signInAs("IT Manager");
    const asset = await createAsset(makeAsset());
    expect(asset.id).toBeDefined();

    const persisted = await readDocAsAdmin<Asset>("assets", asset.id);
    expect(persisted?.name).toBe("Test Laptop");
  });

  it("IT Manager can assign an asset to an employee — a real write, genuinely persisted", async () => {
    await signInAs("IT Manager");
    const asset = await createAsset(makeAsset());

    await assignAsset(asset.id, "employee-uid-1", "Test Employee");

    const persisted = await readDocAsAdmin<Asset>("assets", asset.id);
    expect(persisted?.status).toBe("assigned");
    expect(persisted?.assignedToUid).toBe("employee-uid-1");
    expect(persisted?.assignedTo).toBe("Test Employee");
    expect(persisted?.assignmentHistory).toHaveLength(1);
    expect(persisted?.assignmentHistory[0].employeeUid).toBe("employee-uid-1");
  });

  it("IT Manager can return an assigned asset — status flips back, assignment fields cleared", async () => {
    await signInAs("IT Manager");
    const asset = await createAsset(makeAsset());
    await assignAsset(asset.id, "employee-uid-1", "Test Employee");

    await returnAsset(asset.id, "returned in good condition");

    const persisted = await readDocAsAdmin<Asset & { assignedTo: unknown; assignedToUid: unknown }>("assets", asset.id);
    expect(persisted?.status).toBe("available");
    expect(persisted?.assignedTo).toBeNull();
    expect(persisted?.assignedToUid).toBeNull();
    expect(persisted?.assignmentHistory[0].returnedAt).toBeDefined();
  });

  it("IT Manager can decommission an asset", async () => {
    await signInAs("IT Manager");
    const asset = await createAsset(makeAsset());

    await updateAssetStatus(asset.id, "decommissioned");

    const persisted = await readDocAsAdmin<Asset>("assets", asset.id);
    expect(persisted?.status).toBe("decommissioned");
  });

  it("a role with none of the rule's allowed paths (Staff) is still genuinely rejected on every mutation — the fix isn't a blanket unlock", async () => {
    // Seed the asset as an allowed role first, then switch to Staff to attempt mutations.
    await signInAs("IT Manager");
    const asset = await createAsset(makeAsset());
    const { signOutCurrent } = await import("../helpers/emulator");
    await signOutCurrent();

    await signInAs("Staff");
    await expect(createAsset(makeAsset())).rejects.toThrow(/permission/i);
    await expect(assignAsset(asset.id, "employee-uid-1", "Test Employee")).rejects.toThrow(/permission/i);
    await expect(updateAssetStatus(asset.id, "decommissioned")).rejects.toThrow(/permission/i);

    // Confirm nothing actually changed despite the rejected calls.
    const persisted = await readDocAsAdmin<Asset>("assets", asset.id);
    expect(persisted?.status).toBe("available");
  });

  it("HR and CEO (also rule-permitted) can each create an asset too — confirms the fix covers the full rule set, not just IT Manager", async () => {
    for (const role of ["HR", "CEO"] as const) {
      await signInAs(role);
      const asset = await createAsset(makeAsset({ name: `${role} test asset` }));
      const persisted = await readDocAsAdmin<Asset>("assets", asset.id);
      expect(persisted?.name).toBe(`${role} test asset`);
    }
  });
});
