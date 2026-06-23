import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin } from "../helpers/emulator";
import { createSubscription, cancelSubscription, renewSubscription } from "@/lib/subscriptions-service";
import { getPortalSubscriptions } from "@/lib/client-portal-service";
import type { Subscription } from "@/types/subscriptions";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("Invariant #2 — \"this client's subscriptions\" must mean the same thing everywhere", () => {
  // RESOLVED (subscriptions rebuild, Step A): the CRM-embedded ClientSubscription
  // model (which used to disagree with the portal's top-level-only view — the
  // original D2 finding) has been retired entirely. Confirmed zero production
  // data existed for it. The top-level `subscriptions` collection is now the
  // single source of truth, so there is nothing left to reconcile.
  it("a top-level subscription IS visible in the portal view (confirming the portal's own collection works correctly in isolation)", async () => {
    await signInAs("CFO");
    await createSubscription({
      subId: "SUB-TEST", itemName: "Domain Renewal", clientId: "client-test", clientName: "Test Co Ltd",
      type: "domain", provider: "namecheap", startDate: "2026-01-01", expiryDate: "2027-01-01",
      renewalCost: 25_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [],
      cancelled: false, createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    });

    const portalView = await getPortalSubscriptions("Test Co Ltd");
    expect(portalView).toHaveLength(1);
  });
});

// RESOLVED (subscriptions rebuild, Step A): this described the embedded
// model's string-enum `status` disagreeing with the top-level model's
// boolean `cancelled` for the same business fact. The embedded model (and
// its enum) is gone; the boolean below is now the only representation.
describe("Cancellation state — top-level model only, boolean flag", () => {
  it("the top-level model uses a boolean flag", async () => {
    await signInAs("CFO");
    const sub = await createSubscription({
      subId: "SUB-BOOL", itemName: "License", clientId: "client-bool", clientName: "Test Co",
      type: "license", provider: "microsoft", startDate: "2026-01-01", expiryDate: "2027-01-01",
      renewalCost: 10_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [],
      cancelled: false, createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    });
    await cancelSubscription(sub.id);
    const persisted = await readDocAsAdmin<Subscription>("subscriptions", sub.id);
    expect(typeof persisted?.cancelled).toBe("boolean");
    expect(persisted?.cancelled).toBe(true);
  });
});

describe("DEVIATION D4 — manual renewal posts no journal entry and writes no dedupe key, unlike the cron-triggered renewal", () => {
  it("renewSubscription only updates the subscription itself — it has no knowledge of invoices or journal entries at all", async () => {
    await signInAs("CFO");
    const sub = await createSubscription({
      subId: "SUB-RENEW", itemName: "SSL Cert", clientId: "client-renew", clientName: "Test Co",
      type: "ssl", provider: "namecheap", startDate: "2025-01-01", expiryDate: "2026-01-01",
      renewalCost: 15_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [],
      cancelled: false, createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    });

    await renewSubscription(sub.id, {
      id: "renewal-1", renewedAt: new Date().toISOString(), renewedBy: "test-uid", renewedByName: "Test CFO",
      previousExpiry: "2026-01-01", newExpiry: "2027-01-01", amount: 15_000,
    }, "2027-01-01");

    const persisted = await readDocAsAdmin<Subscription>("subscriptions", sub.id);
    expect(persisted?.expiryDate).toBe("2027-01-01");
    // EXPECTED if this were the single canonical renewal path (matching what
    // the cron job does): an invoice and a journal entry should exist for
    // this renewal. ACTUAL: renewSubscription's own implementation touches
    // only the subscriptions collection — no invoice, no journal entry, and
    // no dedupe key recorded anywhere that a later cron run could check
    // against. (The actual invoice creation for a manual renewal happens as
    // a SEPARATE, hand-rolled call in subscriptions/[id]/page.tsx, not in
    // this service function — confirming the duplicated-logic finding: the
    // service layer itself has no single place that "renewing" goes through
    // for billing purposes.)
    expect(persisted?.renewalLog).toHaveLength(1);
    expect((persisted?.renewalLog[0] as { invoiceId?: string }).invoiceId).toBeUndefined();
  });
});
