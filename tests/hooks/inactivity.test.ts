// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { markLoggedOutForInactivity, consumeInactivityLogoutFlag } from "@/lib/inactivity";

beforeEach(() => {
  sessionStorage.clear();
});

describe("inactivity.ts — passes the logout reason across the redirect exactly once", () => {
  it("consumeInactivityLogoutFlag() returns false when nothing was ever set", () => {
    expect(consumeInactivityLogoutFlag()).toBe(false);
  });

  it("markLoggedOutForInactivity() then consume returns true", () => {
    markLoggedOutForInactivity();
    expect(consumeInactivityLogoutFlag()).toBe(true);
  });

  it("the flag is cleared after being consumed once — a second consume call returns false", () => {
    markLoggedOutForInactivity();
    expect(consumeInactivityLogoutFlag()).toBe(true);
    expect(consumeInactivityLogoutFlag()).toBe(false);
  });
});
