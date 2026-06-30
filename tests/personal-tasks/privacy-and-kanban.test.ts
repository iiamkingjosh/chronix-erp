import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { connectEmulators, clearAll, teardownEmulators, signInAs, seedDoc, readDocAsAdmin } from "../helpers/emulator";
import { getMyTasks, createTask, updateTask, deleteTask, applyReorder } from "@/lib/personal-tasks-service";
import type { PersonalTask } from "@/types/personal-tasks";

beforeAll(async () => {
  await connectEmulators();
});
beforeEach(async () => {
  await clearAll();
});
afterAll(async () => {
  await teardownEmulators();
});

/** Firestore's emulator sometimes folds diagnostic info about OTHER
 * candidate rules into a rejection's .message text, so asserting on
 * .message is brittle - .code is the one stable, documented contract. */
async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: "permission-denied" });
}

function taskData(createdBy: string, overrides: Partial<PersonalTask> = {}): Omit<PersonalTask, "id"> {
  const now = new Date().toISOString();
  return {
    title: "Test task", subtasks: [], status: "todo", order: 0,
    urgency: 2, importance: 2, createdBy, createdAt: now, updatedAt: now,
    ...overrides,
  };
}

describe("Personal Tasks: the owner's own access works end-to-end through the real rules", () => {
  it("a user can create, read, update, and delete their own task", async () => {
    const { uid } = await signInAs("Staff");

    const created = await createTask(taskData(uid, { title: "Write report" }));
    expect(created.id).toBeDefined();

    let mine = await getMyTasks(uid);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe("Write report");

    await updateTask(created.id, { title: "Write report v2" });
    mine = await getMyTasks(uid);
    expect(mine[0].title).toBe("Write report v2");

    await deleteTask(created.id);
    mine = await getMyTasks(uid);
    expect(mine).toHaveLength(0);
  });
});

describe("FIXED: addDoc()/updateDoc() rejected literal `undefined` for an unset optional field", () => {
  it("creating a task with a blank description succeeds — this is the real bug that was hit", async () => {
    const { uid } = await signInAs("Staff");

    const created = await createTask(taskData(uid, { title: "No description here", description: undefined }));

    const mine = await getMyTasks(uid);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe("No description here");
    expect(mine[0]).not.toHaveProperty("description");
  });

  it("clearing a previously-set description via update actually persists the clear, not just locally", async () => {
    const { uid } = await signInAs("Staff");
    const created = await createTask(taskData(uid, { title: "Has a description", description: "Some detail" }));

    await updateTask(created.id, { description: undefined });

    const mine = await getMyTasks(uid);
    expect(mine[0]).not.toHaveProperty("description");
  });
});

describe("FIXED: personal_tasks is genuinely zero-override — not even Root Admin can read another user's tasks", () => {
  it("Root Admin is denied both a direct doc read and a query, despite the pre-existing isRootAdmin() catch-all rule", async () => {
    const ownerUid = "owner-uid-1";
    await seedDoc("personal_tasks", "task-1", taskData(ownerUid, { title: "Owner's private task" }));

    await signInAs("Root Admin");

    await expectPermissionDenied(getDoc(doc(db, "personal_tasks", "task-1")));
    await expectPermissionDenied(
      getDocs(query(collection(db, "personal_tasks"), where("createdBy", "==", ownerUid)))
    );

    // Confirm the document is genuinely still there and untouched — this is a
    // read denial, not a missing-fixture false negative.
    const stillThere = await readDocAsAdmin("personal_tasks", "task-1");
    expect(stillThere).not.toBeNull();
  });

  it("a regular role (CEO) is denied the same way — confirms the base rule itself, not just the Root Admin carve-out", async () => {
    const ownerUid = "owner-uid-2";
    await seedDoc("personal_tasks", "task-2", taskData(ownerUid));

    await signInAs("CEO");

    await expectPermissionDenied(getDoc(doc(db, "personal_tasks", "task-2")));
    await expectPermissionDenied(
      getDocs(query(collection(db, "personal_tasks"), where("createdBy", "==", ownerUid)))
    );
  });

  it("one regular Staff user cannot read another Staff user's tasks either — this is not an admin-only protection", async () => {
    const { uid: userA } = await signInAs("Staff");
    await createTask(taskData(userA, { title: "User A's task" }));

    const { uid: userB } = await signInAs("Staff");
    await expectPermissionDenied(getMyTasks(userA));

    const onlyMine = await getMyTasks(userB);
    expect(onlyMine).toHaveLength(0);
  });

  it("a user cannot create a task with someone else's uid as createdBy", async () => {
    await signInAs("Staff");
    await expectPermissionDenied(createTask(taskData("someone-elses-uid")));
  });
});

describe("Kanban drag persistence", () => {
  it("reordering within a column persists the new order", async () => {
    const { uid } = await signInAs("Staff");
    const t1 = await createTask(taskData(uid, { title: "First", order: 0 }));
    const t2 = await createTask(taskData(uid, { title: "Second", order: 1 }));
    const t3 = await createTask(taskData(uid, { title: "Third", order: 2 }));

    // Drag "Third" to the front: First, Second, Third -> Third, First, Second
    await applyReorder([
      { id: t3.id, order: 0 },
      { id: t1.id, order: 1 },
      { id: t2.id, order: 2 },
    ]);

    const reordered = await getMyTasks(uid);
    expect(reordered.map((t) => t.title)).toEqual(["Third", "First", "Second"]);
  });

  it("dragging between columns updates status and re-orders both columns", async () => {
    const { uid } = await signInAs("Staff");
    const todo1 = await createTask(taskData(uid, { title: "Todo A", status: "todo", order: 0 }));
    const todo2 = await createTask(taskData(uid, { title: "Todo B", status: "todo", order: 1 }));
    const inProg = await createTask(taskData(uid, { title: "In Progress A", status: "in_progress", order: 0 }));

    // Drag "Todo A" into In Progress, landing before the existing card.
    await applyReorder([
      { id: todo1.id, order: 0, status: "in_progress" },
      { id: inProg.id, order: 1 },
      { id: todo2.id, order: 0 },
    ]);

    const all = await getMyTasks(uid);
    const byId = new Map(all.map((t) => [t.id, t]));

    expect(byId.get(todo1.id)?.status).toBe("in_progress");
    expect(byId.get(todo1.id)?.order).toBe(0);
    expect(byId.get(inProg.id)?.status).toBe("in_progress");
    expect(byId.get(inProg.id)?.order).toBe(1);
    expect(byId.get(todo2.id)?.status).toBe("todo");
    expect(byId.get(todo2.id)?.order).toBe(0);
  });
});
