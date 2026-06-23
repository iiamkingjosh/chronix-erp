import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, seedDoc } from "../helpers/emulator";
import { addSubscription } from "@/lib/crm-service";
import { createSubscription, cancelSubscription, renewSubscription } from "@/lib/subscriptions-service";
import { getPortalSubscriptions } from "@/lib/client-portal-service";
import type { Client, ClientSubscription } from "@/types/crm";
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
  it("DEVIATION D2: a subscription added on the CRM client profile never appears in that client's portal view", async () => {
    await signInAs("Sales Rep");
    const clientId = "client-" + Date.now();
    const clientData: Client = {
      id: clientId, clientId: "CLT-TEST", fullName: "Test Client", company: "Test Co Ltd",
      email: "client@test.local", phone: "+2348000000000", subscriptions: [], notes: "", tags: [],
      assignedTo: "test-uid", assignedName: "Test Rep",
      createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    };
    await seedDoc("clients", clientId, clientData as unknown as Record<string, unknown>);

    const embeddedSub: ClientSubscription = {
      id: "sub-1", name: "Annual Hosting Plan", type: "hosting", startDate: "2026-01-01",
      monthlyValue: 50_000, status: "active",
    };
    await addSubscription(clientId, embeddedSub);

    const persistedClient = await readDocAsAdmin<Client>("clients", clientId);
    expect(persistedClient?.subscriptions).toHaveLength(1); // it's recorded on the client profile...

    // ...but the portal reads ONLY the top-level `subscriptions` collection.
    const portalView = await getPortalSubscriptions("Test Co Ltd");
    expect(portalView).toHaveLength(0); // the client sees zero subscriptions despite having one on file internally
  });

  it("a top-level subscription IS visible in the portal view (confirming the portal's own collection works correctly in isolation)", async () => {
    await signInAs("CFO");
    await createSubscription({
      subId: "SUB-TEST", itemName: "Domain Renewal", clientName: "Test Co Ltd",
      type: "domain", provider: "namecheap", startDate: "2026-01-01", expiryDate: "2027-01-01",
      renewalCost: 25_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [],
      cancelled: false, createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    });

    const portalView = await getPortalSubscriptions("Test Co Ltd");
    expect(portalView).toHaveLength(1);
  });
});

describe("DEVIATION D3 — \"cancelled\" is a boolean in one subscription model, an enum string in the other", () => {
  it("the top-level model uses a boolean flag", async () => {
    await signInAs("CFO");
    const sub = await createSubscription({
      subId: "SUB-BOOL", itemName: "License", clientName: "Test Co",
      type: "license", provider: "microsoft", startDate: "2026-01-01", expiryDate: "2027-01-01",
      renewalCost: 10_000, vatApplicable: true, autoRemind: true, notes: "", renewalLog: [],
      cancelled: false, createdAt: new Date().toISOString(), createdBy: "test-uid", updatedAt: new Date().toISOString(),
    });
    await cancelSubscription(sub.id);
    const persisted = await readDocAsAdmin<Subscription>("subscriptions", sub.id);
    expect(typeof persisted?.cancelled).toBe("boolean");
    expect(persisted?.cancelled).toBe(true);
  });

  it("the CRM-embedded model uses an enum string for the identical business state", async () => {
    await signInAs("Sales Rep");
    const clientId = "client-enum-" + Date.now();
    await seedDoc("clients", clientId, {
      id: clientId, clientId: "CLT-TEST2", fullName: "Test", company: "Test", email: "x@test.local",
      phone: "+2348000000000", subscriptions: [], notes: "", tags: [], assignedTo: "x", assignedName: "x",
      createdAt: new Date().toISOString(), createdBy: "x", updatedAt: new Date().toISOString(),
    });
    const embeddedSub: ClientSubscription = {
      id: "sub-enum", name: "Support Contract", type: "contract", startDate: "2026-01-01",
      monthlyValue: 30_000, status: "cancelled", // <-- string enum, not a boolean
    };
    await addSubscription(clientId, embeddedSub);
    const persisted = await readDocAsAdmin<Client>("clients", clientId);
    expect(typeof persisted?.subscriptions[0].status).toBe("string");
    expect(persisted?.subscriptions[0].status).toBe("cancelled");
    // Same business fact ("this subscription is cancelled"), two
    // structurally incompatible representations — `cancelled: true` here
    // vs `cancelled: true` as a boolean over there. Any future code that
    // tries to treat both as one concept must special-case both shapes.
  });
});

describe("DEVIATION D4 — manual renewal posts no journal entry and writes no dedupe key, unlike the cron-triggered renewal", () => {
  it("renewSubscription only updates the subscription itself — it has no knowledge of invoices or journal entries at all", async () => {
    await signInAs("CFO");
    const sub = await createSubscription({
      subId: "SUB-RENEW", itemName: "SSL Cert", clientName: "Test Co",
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
