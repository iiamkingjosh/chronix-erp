import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, queryAsAdmin } from "../helpers/emulator";
import { createPO, updatePOStatus, deletePO } from "@/lib/procurement-service";
import type { PurchaseOrder } from "@/types/procurement";
import type { JournalEntry } from "@/types/finance";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makePOData(overrides: Partial<PurchaseOrder> = {}): Omit<PurchaseOrder, "id"> {
  return {
    poNumber: `PO-TEST-${Date.now()}`,
    vendorId: "vendor-1",
    vendorName: "Test Vendor",
    items: [{ id: "1", name: "Laptops", quantity: 2, unitPrice: 250_000, total: 500_000 }],
    subtotal: 500_000,
    vatAmount: 37_500,
    total: 537_500,
    status: "pending",
    deliveryDate: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    createdBy: "test-uid",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("CORRECTED FINDING (revising the PRD's persona table) — CFO cannot manage procurement at all, and this is intentional, not a bug", () => {
  it("CFO is rejected creating a PO — confirmed consistent with roles.ts, which gives CFO only view:procurement, never manage:procurement", async () => {
    await signInAs("CFO");
    await expect(createPO(makePOData())).rejects.toThrow(/permission/i);
    // The UI's own gate (procurement/orders/page.tsx) checks
    // hasPermission(role, "manage:procurement") — which only Root Admin and
    // System Admin hold — so the "no button shown to CFO" behavior in the
    // UI correctly matches what the rules enforce. This is consistent
    // design, not a deviation; the original PRD's persona table overstated
    // CFO's role here and should be corrected.
  });

  it("System Admin (the actual role this is restricted to) can create a PO, advance it, and post its journal entry", async () => {
    const { uid } = await signInAs("System Admin");
    const po = await createPO(makePOData());
    expect(po.id).toBeDefined();

    await updatePOStatus(po.id, "approved", { uid, name: "Test Admin" });
    await updatePOStatus(po.id, "delivered", { uid, name: "Test Admin" });
    await updatePOStatus(po.id, "paid", { uid, name: "Test Admin" });

    const persisted = await readDocAsAdmin<PurchaseOrder & { _journalPosted?: boolean }>("purchase_orders", po.id);
    expect(persisted?.status).toBe("paid");
    expect(persisted?._journalPosted).toBe(true);

    const entries = await queryAsAdmin("journal_entries", "referenceId", po.id);
    expect(entries).toHaveLength(1);
  });
});

describe("DEVIATION D6 — there is no UI path to reach the \"cancelled\" PO status, even though the service/rules layer fully supports it", () => {
  it("updatePOStatus(..., \"cancelled\") works perfectly fine when called directly — the gap is purely that no button in the audited UI ever calls it", async () => {
    const { uid } = await signInAs("System Admin");
    const po = await createPO(makePOData());

    await updatePOStatus(po.id, "cancelled", { uid, name: "Test Admin" });
    const persisted = await readDocAsAdmin<PurchaseOrder>("purchase_orders", po.id);
    expect(persisted?.status).toBe("cancelled");
    // Confirms the gap is specifically a missing UI affordance
    // (orders/page.tsx's PO_FLOW array only walks forward through
    // pending->approved->delivered->paid), not a missing capability in the
    // service function, the type model, or firestore.rules.
  });
});

describe("FIXED — POs now get the same pending/paid treatment as invoices and WHT bills", () => {
  it("deletePO removes a pending PO cleanly — nothing was ever posted to the ledger to unwind (mirrors WHT/invoice: createPOJournalEntry only ever runs from the \"paid\" transition)", async () => {
    const { uid } = await signInAs("System Admin");
    const po = await createPO(makePOData());
    await updatePOStatus(po.id, "approved", { uid, name: "Test Admin" });

    await deletePO(po.id);
    const persisted = await readDocAsAdmin<PurchaseOrder>("purchase_orders", po.id);
    expect(persisted).toBeNull();

    const entries = await queryAsAdmin("journal_entries", "referenceId", po.id);
    expect(entries).toHaveLength(0);
  });

  it("deletePO refuses once a PO is paid — its journal entry is already posted and immutable", async () => {
    const { uid } = await signInAs("System Admin");
    const po = await createPO(makePOData());
    await updatePOStatus(po.id, "approved", { uid, name: "Test Admin" });
    await updatePOStatus(po.id, "delivered", { uid, name: "Test Admin" });
    await updatePOStatus(po.id, "paid", { uid, name: "Test Admin" });

    await expect(deletePO(po.id)).rejects.toThrow(/already been paid/);

    const entries = await queryAsAdmin("journal_entries", "referenceId", po.id);
    expect(entries).toHaveLength(1); // untouched
  });

  it("DEVIATION FIX — the journal entry's entryDate is the actual payment date, not the PO's original creation date", async () => {
    const { uid } = await signInAs("System Admin");
    // Simulate a real gap: PO created weeks before it's actually paid.
    const po = await createPO(makePOData({ createdAt: "2026-05-01T09:00:00.000Z" }));

    await updatePOStatus(po.id, "approved", { uid, name: "Test Admin" });
    await updatePOStatus(po.id, "delivered", { uid, name: "Test Admin" });
    await updatePOStatus(po.id, "paid", { uid, name: "Test Admin" }); // paidAt stamped "now"

    const [entry] = await queryAsAdmin<JournalEntry>("journal_entries", "referenceId", po.id);
    const today = new Date().toISOString().split("T")[0];
    expect(entry.entryDate).toBe(today);        // dated when cash actually moved…
    expect(entry.entryDate).not.toBe("2026-05-01"); // …not when the PO was written up
  });
});
