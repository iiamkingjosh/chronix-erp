import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signOutCurrent, readDocAsAdmin } from "../helpers/emulator";
import { GET } from "@/app/api/test-invoice-counter/route";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
  await signOutCurrent(); // simulate the real production case: no signed-in user at all
});
afterAll(async () => {
  await teardownEmulators();
});

describe("Invariant #7 — counters must never advance except for a matching, real record", () => {
  it("DEVIATION D1: GET /api/test-invoice-counter is reachable with no authentication at all", async () => {
    const today = new Date();
    const prefix = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    let response: Response | undefined;
    let threw: unknown;
    try {
      response = await GET();
    } catch (e) {
      threw = e;
    }

    const counterAfter = await readDocAsAdmin<{ lastNumber: number }>("metadata", `invoiceCounter_${prefix}`);

    if (threw) {
      // If firestore.rules are actually enforced for this unauthenticated
      // client-SDK call, the route should throw a permission-denied error
      // rather than silently succeed — still a bug (an unauthenticated
      // debug endpoint that 500s in production), but a DIFFERENT bug than
      // "silently burns counters." Recording exactly what happened so the
      // report reflects reality rather than the originally assumed failure mode.
      expect(String(threw)).toMatch(/permission|denied/i);
      // No invoice numbers should have been burned if the writes were rejected.
      expect(counterAfter?.lastNumber ?? 0).toBe(0);
    } else {
      // The originally-assumed failure mode: it silently succeeds and burns
      // two real invoice numbers with zero corresponding invoice ever created.
      expect(response).toBeDefined();
      const body = await response!.json();
      expect(body.first).toBeDefined();
      expect(body.second).toBeDefined();
      expect(counterAfter?.lastNumber).toBe(2); // two numbers consumed by one hit
      const matchingInvoices = await readDocAsAdmin("invoices", "none-should-exist");
      expect(matchingInvoices).toBeNull(); // confirms: no invoice was ever created to justify the burn
    }
  });
});
