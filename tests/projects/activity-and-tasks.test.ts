import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectEmulators, clearAll, teardownEmulators, signInAs, readDocAsAdmin, signOutCurrent } from "../helpers/emulator";
import { createProject, updateProjectStatus, updateTasks, addProjectActivity } from "@/lib/projects-service";
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

describe("Invariant #2 — DEVIATION D1: the activity feed silently omits task creation and completion", () => {
  it("updateTasks (adding a brand-new task) produces no activity entry at all, despite ProjectActivity declaring a \"task_done\" type", async () => {
    const { uid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: uid }));

    const newTask = makeTask({ status: "todo" });
    await updateTasks(project.id, [newTask]);

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    expect(persisted?.tasks).toHaveLength(1);
    // EXPECTED if the activity feed is the project's audit trail: adding a
    // task should leave a trace. ACTUAL: updateTasks only ever touches
    // tasks/progress/updatedAt — confirmed empty activity array.
    expect(persisted?.activity).toHaveLength(0);
  });

  it("updateTasks (marking a task done) ALSO produces no activity entry, even though the type system declares exactly this event (\"task_done\")", async () => {
    const { uid } = await signInAs("Project Manager");
    const task = makeTask({ status: "todo" });
    const project = await createProject(makeProjectData({ createdBy: uid, tasks: [task] }));

    const doneTask = { ...task, status: "done" as const, completedAt: new Date().toISOString() };
    await updateTasks(project.id, [doneTask]);

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    expect(persisted?.progress).toBe(100); // progress DOES update correctly...
    expect(persisted?.activity).toHaveLength(0); // ...but completing the project's only task leaves zero record in the feed
    expect(persisted?.activity.some((a) => a.type === "task_done")).toBe(false); // the declared type is never produced by any code path
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

describe("DEVIATION D2 — whole-array task writes are a last-write-wins concurrency hazard", () => {
  it("two concurrent updateTasks calls based on stale reads silently clobber each other instead of merging", async () => {
    const { uid } = await signInAs("Project Manager");
    const taskA = makeTask({ id: "task-a", title: "Task A" });
    const taskB = makeTask({ id: "task-b", title: "Task B" });
    const project = await createProject(makeProjectData({ createdBy: uid, tasks: [taskA, taskB] }));

    // Two "team members" each read the same initial [taskA, taskB] state,
    // then independently mark their OWN task done and write back the WHOLE
    // array as they saw it — exactly what the UI's optimistic handlers do.
    const staleRead: Task[] = [taskA, taskB];
    const writeFromMemberOne = staleRead.map((t) => (t.id === "task-a" ? { ...t, status: "done" as const } : t));
    const writeFromMemberTwo = staleRead.map((t) => (t.id === "task-b" ? { ...t, status: "done" as const } : t));

    await updateTasks(project.id, writeFromMemberOne);
    await updateTasks(project.id, writeFromMemberTwo); // this write is based on the SAME stale snapshot — it has no idea member one already wrote

    const persisted = await readDocAsAdmin<Project>("projects", project.id);
    // EXPECTED if concurrent edits were safe: both tasks should end up
    // "done". ACTUAL: the second writer's stale copy of task-a (still
    // "todo") overwrites member one's update — member one's change is
    // silently lost.
    const finalTaskA = persisted?.tasks.find((t) => t.id === "task-a");
    const finalTaskB = persisted?.tasks.find((t) => t.id === "task-b");
    expect(finalTaskA?.status).toBe("todo"); // member one's completion was clobbered
    expect(finalTaskB?.status).toBe("done");
  });
});

describe("Invariant #6 — the narrow self-service update rules for non-managers work exactly as designed (confirmed correct here)", () => {
  it("a non-manager team member CAN update tasks/progress via the isTeamMemberTaskUpdate rule", async () => {
    const { uid: pmUid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: pmUid }));
    await signOutCurrent();

    await signInAs("Staff"); // not a manager, but isStaffLike() satisfies hasViewProjects()
    await expect(updateTasks(project.id, [makeTask()])).resolves.toBeUndefined();
  });

  it("NEW FINDING: the isTeamMemberActivityUpdate self-service path can fail on Firestore's hard expression-evaluation limit, because it's the LAST clause in a 5-way OR chain whose earlier clauses redundantly re-derive the same role lookups", async () => {
    const { uid: pmUid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: pmUid }));
    await signOutCurrent();

    await signInAs("Staff");
    // The `projects` update rule is:
    //   canManageProjects() || resource.data.createdBy == auth.uid ||
    //   isFilesOnlyUpdate() || isTeamMemberTaskUpdate() || isTeamMemberActivityUpdate()
    // None of `canManageProjects()`, `isFilesOnlyUpdate()`, or
    // `isTeamMemberTaskUpdate()` short-circuit true for this write (Staff
    // isn't a manager, and this write touches `activity` not `files`/`tasks`),
    // so evaluation falls through all four prior clauses before reaching
    // the one that actually matches. Each of `isFilesOnlyUpdate`,
    // `isTeamMemberTaskUpdate`, and `isTeamMemberActivityUpdate` independently
    // calls `hasViewProjects()`, which itself calls 8 separate role-check
    // functions, each doing its own `get()` on the caller's user doc — none
    // of it memoized. Reproducibly (confirmed by running this test in
    // isolation, not just once): this accumulates enough evaluations to
    // hit Firestore's 1000-expression-per-request ceiling, and the
    // self-service write that the rule was clearly written to allow is
    // rejected with `permission-denied` instead.
    let code: string | undefined;
    try {
      await addProjectActivity(project.id, {
        id: "note-1", type: "note", content: "test note", authorUid: "x", authorName: "Test Staff", createdAt: new Date().toISOString(),
      });
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    expect(code).toBe("permission-denied");
    // NOTE: this is a property of the *emulator's* enforcement of a real
    // Firestore platform limit (1000 expression evaluations per rule
    // request). Whether production Firestore hits the identical ceiling
    // for this exact rule shape was not independently verified here — flagged
    // as something worth confirming against the real deployed project, since
    // the consequence (a legitimate self-service activity note silently
    // rejected) would be significant if it also reproduces there.
  });

  it("that SAME non-manager CANNOT change the project's status (touches `status`, outside every narrow allowlist)", async () => {
    const { uid: pmUid } = await signInAs("Project Manager");
    const project = await createProject(makeProjectData({ createdBy: pmUid }));
    await signOutCurrent();

    await signInAs("Staff");
    await expect(updateProjectStatus(project.id, "completed", { uid: "x", name: "Test Staff" })).rejects.toThrow(/permission/i);
  });
});
