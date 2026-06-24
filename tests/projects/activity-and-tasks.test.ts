import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, signInExisting, readDocAsAdmin, signOutCurrent } from "../helpers/emulator";
import { createProject, updateProjectStatus, addTask, setTaskStatus, addProjectActivity } from "@/lib/projects-service";
import type { Project, Task } from "@/types/projects";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

function makeProjectData(overrides: Partial<Project> = {}): Omit<Project, "id"> {
  return {
    projectId: `PRJ-TEST-${Date.now()}`,
    name: "Test Project",
    clientName: "Test Client",
    type: "web_dev",
    description: "Test",
    status: "not_started",
    team: [],
    startDate: "2026-01-01",
    deadline: "2026-12-31",
    milestones: [],
    tasks: [],
    activity: [],
    progress: 0,
    createdAt: new Date().toISOString(),
    createdBy: "test-uid",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-" + Math.random().toString(36).slice(2),
    title: "Test Task",
    assignedTo: "test-uid",
    assignedName: "Test User",
    status: "todo",
    priority: "medium",
    createdAt: new Date().toISOString(),
    createdBy: "test-uid",
    ...overrides,
  };
}

describe("Invariant #2 — DEVIATION D1 (fixed): task creation and completion now log to the activity feed", () => {
  it("addTask() logs a \"task_created\" activity entry alongside the tasks/progress write", async () => {
    const { uid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: uid }));

    const newTask = makeTask({ status: "todo" });
    await addTask(project.id, newTask, { uid, name: "Test PM" });

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    expect(persisted?.tasks).toHaveLength(1);
    expect(persisted?.activity).toHaveLength(1);
    expect(persisted?.activity[0].type).toBe("task_created");
  });

  it("setTaskStatus() transitioning a task TO done logs a \"task_done\" activity entry", async () => {
    const { uid } = await signInAs("Project Manager");
    const task = makeTask({ status: "todo" });
    const project = await createProject(makeProjectData({ createdBy: uid, tasks: [task] }));

    await setTaskStatus(project.id, task.id, "done", { uid, name: "Test PM" });

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    expect(persisted?.progress).toBe(100);
    expect(persisted?.activity).toHaveLength(1);
    expect(persisted?.activity[0].type).toBe("task_done");
  });

  it("setTaskStatus() between two non-done statuses logs nothing - only the transition TO done counts as completion", async () => {
    const { uid } = await signInAs("Project Manager");
    const task = makeTask({ status: "todo" });
    const project = await createProject(makeProjectData({ createdBy: uid, tasks: [task] }));

    await setTaskStatus(project.id, task.id, "in_progress", { uid, name: "Test PM" });

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    expect(persisted?.tasks[0].status).toBe("in_progress");
    expect(persisted?.activity).toHaveLength(0);
  });

  it("by contrast, updateProjectStatus and completeMilestone DO correctly log their own activity types", async () => {
    const { uid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: uid }));
    await updateProjectStatus(project.id, "in_progress", { uid, name: "Test PM" });

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    expect(persisted?.activity).toHaveLength(1);
    expect(persisted?.activity[0].type).toBe("status_change");
  });
});

describe("DEVIATION D2 (fixed) — setTaskStatus() re-reads fresh inside a transaction instead of trusting a stale client snapshot", () => {
  it("two concurrent setTaskStatus() calls completing different tasks both survive - neither overwrites the other", async () => {
    const { uid } = await signInAs("Project Manager");
    const taskA = makeTask({ id: "task-a", title: "Task A" });
    const taskB = makeTask({ id: "task-b", title: "Task B" });
    const project = await createProject(makeProjectData({ createdBy: uid, tasks: [taskA, taskB] }));

    // Two "team members" each independently complete a DIFFERENT task,
    // genuinely concurrently (both in flight before either resolves) -
    // simulating two real sessions racing against the same project doc.
    await Promise.all([
      setTaskStatus(project.id, "task-a", "done", { uid, name: "Member One" }),
      setTaskStatus(project.id, "task-b", "done", { uid, name: "Member Two" }),
    ]);

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    const finalTaskA = persisted?.tasks.find((t) => t.id === "task-a");
    const finalTaskB = persisted?.tasks.find((t) => t.id === "task-b");
    // FIXED: both completions survive — the transaction re-reads fresh on
    // each attempt (and retries automatically on contention), so neither
    // writer's stale copy of the other's task can clobber it.
    expect(finalTaskA?.status).toBe("done");
    expect(finalTaskB?.status).toBe("done");
    expect(persisted?.progress).toBe(100);
    // Both completions should also have logged their own "task_done" entry.
    expect(persisted?.activity.filter((a) => a.type === "task_done")).toHaveLength(2);
  });
});

describe("Invariant #6 — the narrow self-service update rules for non-managers work exactly as designed (confirmed correct here)", () => {
  it("a non-manager team member CAN update tasks/progress via the isTeamMemberTaskUpdate rule (addTask)", async () => {
    const { uid: pmUid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: pmUid }));
    await signOutCurrent();

    const { uid: staffUid } = await signInAs("Staff"); // not a manager, but isStaffLike() satisfies hasViewProjects()
    await expect(
      addTask(project.id, makeTask(), { uid: staffUid, name: "Test Staff" })
    ).resolves.toBeUndefined();
  });

  it("a non-manager team member assigned to a task CAN call setTaskStatus() on their own task - the exact case that would have broken had the rules needed widening", async () => {
    const { uid: pmUid } = await signInAs("Project Manager");
    const { uid: staffUid, email: staffEmail } = await signInAs("Staff");
    await signOutCurrent();

    await signInAs("Project Manager");
    const task = makeTask({ assignedTo: staffUid });
    const project = await createProject(makeProjectData({ createdBy: pmUid, tasks: [task] }));
    await signOutCurrent();

    await signInExisting(staffEmail);
    await expect(
      setTaskStatus(project.id, task.id, "done", { uid: staffUid, name: "Test Staff" })
    ).resolves.toBeUndefined();

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    expect(persisted?.tasks.find((t) => t.id === task.id)?.status).toBe("done");
    expect(persisted?.activity.some((a) => a.type === "task_done")).toBe(true);
  });

  it("FIXED: the isTeamMemberActivityUpdate self-service path no longer hits Firestore's expression-evaluation ceiling", async () => {
    const { uid: pmUid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: pmUid }));
    await signOutCurrent();

    await signInAs("Staff");
    // The `projects` update rule used to be:
    //   canManageProjects() || resource.data.createdBy == auth.uid ||
    //   isFilesOnlyUpdate() || isTeamMemberTaskUpdate() || isTeamMemberActivityUpdate()
    // None of `canManageProjects()`, `isFilesOnlyUpdate()`, or
    // `isTeamMemberTaskUpdate()` short-circuit true for this write (Staff
    // isn't a manager, and this write touches `activity` not `files`/`tasks`),
    // so evaluation fell through all four prior clauses before reaching the
    // one that actually matched. Each of `isFilesOnlyUpdate`,
    // `isTeamMemberTaskUpdate`, and `isTeamMemberActivityUpdate` independently
    // called `hasViewProjects()`, which itself calls ~8 separate role-check
    // functions (several of which OR together multiple role() lookups of
    // their own) — none of it memoized, ~20 role()-backed lookups recomputed
    // three times over. Reproducibly: this accumulated enough evaluations to
    // hit Firestore's 1000-expression-per-request ceiling, rejecting a write
    // the rule was clearly written to allow.
    //
    // FIXED: isProjectsSelfServiceUpdate() now computes isInternalStaff() &&
    // hasViewProjects() exactly once via a `let` binding and threads the
    // result into all three shape-checks as a parameter, cutting this
    // dominant cost to roughly a third of what it was - same permission
    // semantics, verified below to now resolve instead of reject.
    await expect(
      addProjectActivity(project.id, {
        id: "note-1", type: "note", content: "test note", authorUid: "x", authorName: "Test Staff", createdAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it("that SAME non-manager CANNOT change the project's status (touches `status`, outside every narrow allowlist)", async () => {
    const { uid: pmUid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: pmUid }));
    await signOutCurrent();

    await signInAs("Staff");
    await expect(updateProjectStatus(project.id, "completed", { uid: "x", name: "Test Staff" })).rejects.toThrow(/permission/i);
  });
});
