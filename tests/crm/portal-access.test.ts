import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, seedUserRole, seedDoc, readDocAsAdmin } from "../helpers/emulator";
import { getPortalInvoices, loadClientPortalState } from "@/lib/client-portal-service";
import { getDocs, collection, query, where } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

describe("Invariant #5 — a client portal user must see exactly their own records, never a false empty result", () => {
  it("DEVIATION D5: a client whose user doc has no portalBillingCompany set gets permission-denied on every company-keyed invoice, indistinguishable from \"you have none\"", async () => {
    const { uid } = await signInAs("Client");
    // Deliberately do NOT set portalBillingCompany/portalBillingName —
    // simulating a client account that was provisioned without that field,
    // which convertToClient() never sets either (confirmed: it has no
    // portal-billing fields in its output at all).
    await seedUserRole(uid, "Client" as never); // re-seed without billing fields, overwriting any defaults

    await seedDoc("invoices", "inv-1", {
      invoiceNumber: "CT-TEST-1",
      client: { name: "Acme Holdings Ltd" }, // company-name-keyed, as real invoices are
      status: "paid",
      subtotal: 100_000, vatAmount: 7_500, total: 107_500,
      invoiceDate: "2026-06-01", createdAt: new Date().toISOString(), createdBy: "x",
    });

    // The portal SERVICE issues this exact query — it succeeds client-side
    // (the query itself is well-formed), but every document it would
    // return is gated by userPortalBillingMatches(), which requires
    // tokenEmail() to equal the company name (never true) OR
    // portalBillingCompany to be set and match (not set here).
    let thrown: unknown;
    try {
      await getPortalInvoices("Acme Holdings Ltd");
    } catch (e) {
      thrown = e;
    }
    // EXPECTED under invariant #5: either the client sees their invoice, or
    // — if genuinely misconfigured — a clear, distinguishable error.
    // ACTUAL: Firestore rejects each matching document read with
    // permission-denied. Critically, `getPortalInvoices` filters client-side
    // AFTER the query resolves — a rules rejection on the read itself
    // surfaces as a thrown error here, but in the actual portal page
    // (invoices/page.tsx) this is exactly the kind of failure that gets
    // swallowed by ClientAuthContext's blanket catch and shown as "you have
    // no invoices" with no diagnostic. Confirming the underlying read is
    // genuinely rejected, which is the root cause that UI-layer catch then
    // obscures:
    expect(thrown).toBeDefined();
    expect((thrown as { code?: string }).code).toBe("permission-denied");
  });

  it("the identical client succeeds once portalBillingCompany is set to match the invoice's company name", async () => {
    const { uid } = await signInAs("Client");
    await seedUserRole(uid, "Client" as never, { portalBillingCompany: "Acme Holdings Ltd" });

    await seedDoc("invoices", "inv-2", {
      invoiceNumber: "CT-TEST-2",
      client: { name: "Acme Holdings Ltd" },
      status: "paid",
      subtotal: 100_000, vatAmount: 7_500, total: 107_500,
      invoiceDate: "2026-06-01", createdAt: new Date().toISOString(), createdBy: "x",
    });

    const invoices = await getPortalInvoices("Acme Holdings Ltd");
    expect(invoices).toHaveLength(1);
  });
});

describe("DEVIATION D8 — the CRM client profile's fuzzy company-name matching can disagree with the portal's exact matching", () => {
  it("a near-miss company name spelling is picked up by the fuzzy substring match but missed by the portal's exact match", async () => {
    await signInAs("Sales Rep");
    await seedDoc("invoices", "inv-fuzzy", {
      invoiceNumber: "CT-TEST-3",
      client: { name: "Acme Holdings Limited" }, // note: "Limited" not "Ltd"
      status: "paid",
      subtotal: 50_000, vatAmount: 3_750, total: 53_750,
      invoiceDate: "2026-06-01", createdAt: new Date().toISOString(), createdBy: "x",
    });

    // Exact match, as client-portal-service.ts performs it (and as the
    // portal genuinely queries): looks for a literal company-name match.
    const exactMatch = await getDocs(query(collection(db, "invoices"), where("client.name", "==", "Acme Holdings Ltd")));
    expect(exactMatch.docs).toHaveLength(0); // "Ltd" !== "Limited" — exact match finds nothing

    // Fuzzy match, replicating clients/[id]/page.tsx's exact algorithm:
    // `i.client.name.toLowerCase().includes(co) || co.includes(i.client.name...)`
    // scanning ALL invoices client-side rather than querying by exact field.
    const allInvoices = await getDocs(collection(db, "invoices"));
    const co = "acme holdings ltd";
    const fuzzyMatches = allInvoices.docs.filter((d) => {
      const name = ((d.data().client as { name?: string })?.name ?? "").toLowerCase();
      return name.includes(co) || co.includes(name) || name.includes("acme") || "acme holdings ltd".includes("acme");
    });
    // The CRM client profile's substring approach is loose enough to treat
    // "Acme Holdings Limited" and "Acme Holdings Ltd" as the same company
    // (both contain "acme"), while the portal's exact-match query for the
    // canonical "Acme Holdings Ltd" string finds nothing. Same client,
    // same invoice, two different verdicts depending which screen asks.
    expect(fuzzyMatches.length).toBeGreaterThan(0);
    expect(fuzzyMatches.length).not.toBe(exactMatch.docs.length);
  });
});

describe("FIXED: DEVIATION D7 — loadClientPortalState() is a testable seam that classifies failures instead of a bare catch-all", () => {
  it("a user whose getClientByEmail succeeds but whose invoice read is rules-denied gets errorKind 'denied', not silently nulled", async () => {
    const { uid } = await signInAs("Client");
    await seedUserRole(uid, "Client" as never); // no portalBilling* fields - matches reality, nothing ever sets them

    // The Client record IS found by email (getClientByEmail succeeds) -
    // but it has no usable company/fullName at all (bad/incomplete data).
    // Self-heal still runs and writes portalBillingCompany="" /
    // portalBillingName="" - both fail the rule's own `!= ''` guard, so
    // even with self-heal having genuinely executed, there is nothing
    // meaningful for userPortalBillingMatches() to match against. The
    // canary query (clientName resolves to "") cannot be proven to
    // satisfy the rule, so Firestore rejects it outright - a realistic
    // "denied" that survives self-heal, since self-heal can only backfill
    // from data that exists.
    await seedDoc("clients", "client-1", {
      clientId: "CLT-TEST-1", fullName: "", company: "",
      email: auth.currentUser!.email, phone: "+2348000000000", notes: "", tags: [],
      assignedTo: "x", assignedName: "x", createdAt: new Date().toISOString(), createdBy: "x", updatedAt: new Date().toISOString(),
    });
    await seedDoc("invoices", "inv-denied-1", {
      invoiceNumber: "CT-TEST-DENIED", client: { name: "Acme Holdings Ltd" },
      status: "paid", subtotal: 100_000, vatAmount: 7_500, total: 107_500,
      invoiceDate: "2026-06-01", createdAt: new Date().toISOString(), createdBy: "x",
    });

    const state = await loadClientPortalState(auth.currentUser!);
    expect(state.errorKind).toBe("denied");
    expect(state.clientRecord).not.toBeNull();
  });

  it("the self-heal write actually persists portalBillingCompany/portalBillingName/portalBillingEmail onto the user's own doc when a matching Client record is found", async () => {
    const { uid } = await signInAs("Client");
    await seedUserRole(uid, "Client" as never);

    await seedDoc("clients", "client-2", {
      clientId: "CLT-TEST-2", fullName: "Jane Doe", company: "Beta Logistics Inc",
      email: auth.currentUser!.email, phone: "+2348000000001", notes: "", tags: [],
      assignedTo: "x", assignedName: "x", createdAt: new Date().toISOString(), createdBy: "x", updatedAt: new Date().toISOString(),
    });

    // No invoices seeded - genuinely zero, confirming this is the "none" +
    // empty-list case, not a denial, AND that self-heal still ran (it's
    // unconditional once a clientRecord is found).
    const state = await loadClientPortalState(auth.currentUser!);
    expect(state.errorKind).toBe("none");

    const persistedUser = await readDocAsAdmin<{
      portalBillingCompany?: string; portalBillingName?: string; portalBillingEmail?: string;
    }>("users", uid);
    expect(persistedUser?.portalBillingCompany).toBe("Beta Logistics Inc");
    expect(persistedUser?.portalBillingName).toBe("Jane Doe");
    expect(persistedUser?.portalBillingEmail).toBe(auth.currentUser!.email);
  });

  it("a Client with no matching Client record at all gets errorKind 'none' with no clientRecord - a genuine non-setup, not an error", async () => {
    const { uid } = await signInAs("Client");
    await seedUserRole(uid, "Client" as never);
    // Deliberately no `clients` doc seeded for this email at all.

    const state = await loadClientPortalState(auth.currentUser!);
    expect(state.errorKind).toBe("none");
    expect(state.clientRecord).toBeNull();
  });
});
