// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";

const MIN = 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function fireActivity(type: string = "mousedown") {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

describe("useInactivityLogout — warns at 14 minutes, logs out at 15", () => {
  it("does nothing at all while active=false, even past both thresholds", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(({ active }) => useInactivityLogout(active, onLogout), {
      initialProps: { active: false },
    });

    act(() => { vi.advanceTimersByTime(20 * MIN); });

    expect(result.current.showWarning).toBe(false);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("shows the warning at 14 minutes of true inactivity, then logs out at 15", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() => useInactivityLogout(true, onLogout));

    expect(result.current.showWarning).toBe(false);

    act(() => { vi.advanceTimersByTime(14 * MIN); });
    expect(result.current.showWarning).toBe(true);
    expect(onLogout).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1 * MIN); });
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(result.current.showWarning).toBe(false); // cleared once it actually fires
  });

  it("real activity before 14 minutes resets the clock — warning fires 14 minutes after the LAST activity, not the first", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() => useInactivityLogout(true, onLogout));

    act(() => { vi.advanceTimersByTime(10 * MIN); });
    fireActivity(); // resets at the 10-minute mark

    // Without the reset, the original timer would have fired at 14 min
    // (4 minutes from now). It must NOT have fired yet.
    act(() => { vi.advanceTimersByTime(4 * MIN); });
    expect(result.current.showWarning).toBe(false);

    // 14 minutes after the reset (10 + 14 = 24 minutes total) it should fire.
    act(() => { vi.advanceTimersByTime(10 * MIN); });
    expect(result.current.showWarning).toBe(true);
  });

  it("rapid-fire activity within the 1-second throttle window only resets once, not on every event", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() => useInactivityLogout(true, onLogout));

    act(() => { vi.advanceTimersByTime(10 * MIN); });
    fireActivity(); // real reset, at t=10min

    // A second activity event 500ms later — inside the 1s throttle window —
    // must NOT push the reset point forward to 10min+500ms.
    act(() => { vi.advanceTimersByTime(500); });
    fireActivity();

    // If the throttled event HAD reset the timer, warning would fire at
    // 10min + 500ms + 14min. Advancing to exactly 14min after the FIRST
    // reset (so 500ms short of that hypothetical later time) must already
    // show the warning, proving only the first reset counted.
    act(() => { vi.advanceTimersByTime(14 * MIN - 500); });
    expect(result.current.showWarning).toBe(true);
  });

  it("stayLoggedIn() dismisses the warning and restarts the full 15-minute window", () => {
    const onLogout = vi.fn();
    const { result } = renderHook(() => useInactivityLogout(true, onLogout));

    act(() => { vi.advanceTimersByTime(14 * MIN); });
    expect(result.current.showWarning).toBe(true);

    act(() => { result.current.stayLoggedIn(); });
    expect(result.current.showWarning).toBe(false);

    // Almost a full new window must pass with no logout.
    act(() => { vi.advanceTimersByTime(14 * MIN + 59 * 1000); });
    expect(onLogout).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2 * 1000); });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("toggling active from true to false mid-countdown clears pending timers — no delayed logout fires later", () => {
    const onLogout = vi.fn();
    const { rerender } = renderHook(({ active }) => useInactivityLogout(active, onLogout), {
      initialProps: { active: true },
    });

    act(() => { vi.advanceTimersByTime(14 * MIN); });
    rerender({ active: false });

    act(() => { vi.advanceTimersByTime(10 * MIN); });
    expect(onLogout).not.toHaveBeenCalled();
  });
});
