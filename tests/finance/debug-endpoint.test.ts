import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("Invariant #7 — counters must never advance except for a matching, real record", () => {
  it("FIXED: DEVIATION D1 — /api/test-invoice-counter (unauthenticated debug route that burned real counter slots) is deleted entirely, not just gated", () => {
    expect(existsSync(join(process.cwd(), "src/app/api/test-invoice-counter"))).toBe(false);
  });
});
