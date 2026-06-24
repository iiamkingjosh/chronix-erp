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
      renewalCost: 25_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [], invoiceIds: [],
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
      renewalCost: 10_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [], invoiceIds: [],
      cancelled: false, createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    });
    await cancelSubscription(sub.id);
    const persisted = await readDocAsAdmin<Subscription>("subscriptions", sub.id);
    expect(typeof persisted?.cancelled).toBe("boolean");
    expect(persisted?.cancelled).toBe(true);
  });
});

// RESOLVED (Subscriptions rebuild, Step B): renewSubscription() now creates
// the matching invoice itself, as one fail-clean unit, instead of leaving
// invoice creation as a separate hand-rolled call in the page component.
// The structured link (renewalLog[].invoiceId and the subscription's own
// invoiceIds array) now exists; it's no longer undefined.
describe("D4 — renewSubscription now creates its own invoice and records a structured link", () => {
  it("a renewal with amount > 0 creates a real invoice and links it via invoiceId + invoiceIds", async () => {
    const { uid } = await signInAs("CFO");
    const sub = await createSubscription({
      subId: "SUB-RENEW", itemName: "SSL Cert", clientId: "client-renew", clientName: "Test Co",
      type: "ssl", provider: "namecheap", startDate: "2025-01-01", expiryDate: "2026-01-01",
      renewalCost: 15_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [], invoiceIds: [],
      cancelled: false, createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    });

    const { subscription, invoice } = await renewSubscription(sub.id, {
      newExpiry: "2027-01-01", amount: 15_000, renewedBy: uid, renewedByName: "Test CFO",
    });

    expect(invoice).not.toBeNull();
    expect(invoice!.total).toBeGreaterThan(0);
    expect(subscription.expiryDate).toBe("2027-01-01");
    expect(subscription.renewalLog).toHaveLength(1);
    expect(subscription.renewalLog[0].invoiceId).toBe(invoice!.id);
    expect(subscription.invoiceIds).toEqual([invoice!.id]);

    const persisted = await readDocAsAdmin<Subscription>("subscriptions", sub.id);
    expect(persisted?.expiryDate).toBe("2027-01-01");
    expect(persisted?.invoiceIds).toEqual([invoice!.id]);
  });
});
