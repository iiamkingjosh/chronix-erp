// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { PersonalTask } from "@/types/personal-tasks";

const { getMyTasks, createTask, updateTask, deleteTask, applyReorder } = vi.hoisted(() => ({
  getMyTasks:   vi.fn(),
  createTask:   vi.fn(),
  updateTask:   vi.fn(),
  deleteTask:   vi.fn(),
  applyReorder: vi.fn(),
}));

vi.mock("@/lib/personal-tasks-service", () => ({ getMyTasks, createTask, updateTask, deleteTask, applyReorder }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { uid: "test-uid", email: "test@test.local", displayName: "Test User", role: "Staff" },
    firebaseUser: { uid: "test-uid" },
    loading: false,
    profileError: null,
    signOut: vi.fn(),
  }),
}));

// Imported after the mocks above so it picks up the mocked modules.
const { default: MyTasksPage } = await import("@/app/(dashboard)/dashboard/my-tasks/page");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeTask(overrides: Partial<PersonalTask> = {}): PersonalTask {
  const now = new Date().toISOString();
  return {
    id: "task-1", title: "Sample task", subtasks: [], status: "todo", order: 0,
    urgency: 2, importance: 2, createdBy: "test-uid", createdAt: now, updatedAt: now,
    ...overrides,
  };
}

describe("MyTasksPage: initial load failure shows a real error state, distinguishable from genuine emptiness", () => {
  it("transient failure shows a retryable error panel — Retry button present, not the Kanban board", async () => {
    // Plain Error with no .code → treated as transient; Retry is meaningful.
    getMyTasks.mockRejectedValue(new Error("simulated transient failure"));

    render(createElement(MyTasksPage));

    await waitFor(() => {
      expect(screen.getByText("⚠ Couldn't load your tasks.")).toBeTruthy();
    });
    expect(screen.getByText("Please try again.")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.queryByText("Drop here")).toBeNull();
  });

  it("structural failure (failed-precondition / missing index) shows NO Retry — 'Retry won't help' message instead", async () => {
    const err = Object.assign(new Error("Missing index"), { code: "failed-precondition" });
    getMyTasks.mockRejectedValue(err);

    render(createElement(MyTasksPage));

    await waitFor(() => {
      expect(screen.getByText("⚠ Couldn't load your tasks.")).toBeTruthy();
    });
    expect(screen.getByText(/This is a configuration issue/)).toBeTruthy();
    // Retry must NOT appear — it loops forever against a structural failure.
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("structural failure (permission-denied) also suppresses Retry", async () => {
    const err = Object.assign(new Error("Permission denied"), { code: "permission-denied" });
    getMyTasks.mockRejectedValue(err);

    render(createElement(MyTasksPage));

    await waitFor(() => {
      expect(screen.getByText("⚠ Couldn't load your tasks.")).toBeTruthy();
    });
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("genuinely zero tasks (load succeeds with an empty list) shows the real empty board, not the error panel", async () => {
    getMyTasks.mockResolvedValue([]);

    render(createElement(MyTasksPage));

    await waitFor(() => {
      expect(screen.getAllByText("Drop here").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("⚠ Couldn't load your tasks.")).toBeNull();
  });

  it("Retry re-fetches and recovers into the real board on success", async () => {
    // No .code → transient → Retry button appears.
    getMyTasks.mockRejectedValueOnce(new Error("simulated transient failure"));
    getMyTasks.mockResolvedValueOnce([makeTask({ title: "Recovered task" })]);

    render(createElement(MyTasksPage));

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("Recovered task")).toBeTruthy();
    });
  });
});

describe("MyTasksPage: delete and subtask-toggle failures are visible, not silent", () => {
  it("a failed delete shows a visible error and leaves the task in place", async () => {
    getMyTasks.mockResolvedValue([makeTask({ title: "Cannot delete me" })]);
    deleteTask.mockRejectedValue(new Error("simulated delete failure"));

    render(createElement(MyTasksPage));
    await waitFor(() => expect(screen.getByText("Cannot delete me")).toBeTruthy());

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(screen.getByText("Couldn't delete the task. Please try again.")).toBeTruthy();
    });
    expect(screen.getByText("Cannot delete me")).toBeTruthy();
  });

  it("a failed subtask toggle shows a visible error and reverts the optimistic check", async () => {
    const task = makeTask({
      title: "Has a subtask",
      subtasks: [{ id: "sub-1", text: "Do the thing", done: false }],
    });
    getMyTasks.mockResolvedValue([task]);
    updateTask.mockRejectedValue(new Error("simulated toggle failure"));

    render(createElement(MyTasksPage));
    await waitFor(() => expect(screen.getByText("Do the thing")).toBeTruthy());

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText("Couldn't update the subtask. Please try again.")).toBeTruthy();
    });
    expect(checkbox.checked).toBe(false);
  });
});
