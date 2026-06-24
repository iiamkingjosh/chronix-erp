import {
  collection, doc, addDoc, getDoc, getDocs, deleteDoc,
  updateDoc, query, orderBy, arrayUnion, arrayRemove, runTransaction,
} from "firebase/firestore";
import { db, storage } from "./firebase";
import { ref, deleteObject } from "firebase/storage";
import type {
  Project, Task, Milestone, ProjectActivity, ProjectStatus, TaskStatus, ProjectFile,
} from "@/types/projects";
import { calcProgress, deriveProjectStatus, PROJECT_STATUS_LABELS } from "@/types/projects";

const PROJ = "projects";

export async function createProject(data: Omit<Project, "id">): Promise<Project> {
  const ref = await addDoc(collection(db, PROJ), data);
  return { ...data, id: ref.id };
}

export async function getProjects(): Promise<Project[]> {
  const snap = await getDocs(query(collection(db, PROJ), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, PROJ, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Project) : null;
}

/** Status is otherwise fully derived from task-completion percentage
 * (see deriveProjectStatus()) - "on hold" is the one manual override.
 * Writes status alone (no tasks/progress), so this deliberately does NOT
 * qualify under isTeamMemberTaskUpdate() - stays manager/creator-only. */
export async function putProjectOnHold(
  projectId: string,
  author: { uid: string; name: string }
): Promise<void> {
  const entry: ProjectActivity = {
    id:         crypto.randomUUID(),
    type:       "status_change",
    content:    `Status changed to ${PROJECT_STATUS_LABELS.on_hold}`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  new Date().toISOString(),
  };
  await updateDoc(doc(db, PROJ, projectId), {
    status:    "on_hold",
    updatedAt: new Date().toISOString(),
    activity:  arrayUnion(entry),
  });
}

/** Re-derives status from the project's CURRENT tasks (read fresh inside a
 * transaction) the moment the hold is lifted, rather than trusting any
 * stale local progress value - matches the same fresh-read discipline as
 * addTask()/setTaskStatus(). */
export async function takeProjectOffHold(
  projectId: string,
  author: { uid: string; name: string }
): Promise<ProjectStatus> {
  const ref = doc(db, PROJ, projectId);
  const now = new Date().toISOString();
  let newStatus: ProjectStatus;

  await runTransaction(db, async (tx) => {
    const snap     = await tx.get(ref);
    const tasks    = (snap.data()?.tasks as Task[] | undefined) ?? [];
    const progress = calcProgress(tasks);
    // "not_started" here is just a non-"on_hold" placeholder - deriveProjectStatus()
    // only inspects currentStatus to decide whether to stay pinned at "on_hold",
    // and we're explicitly lifting that pin, so any non-"on_hold" value bypasses it.
    newStatus = deriveProjectStatus(progress, "not_started");
    tx.update(ref, { status: newStatus, updatedAt: now });
  });

  await addProjectActivity(projectId, {
    id:         crypto.randomUUID(),
    type:       "status_change",
    content:    `Status changed to ${PROJECT_STATUS_LABELS[newStatus!]}`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  now,
  });

  return newStatus!;
}

export async function addProjectActivity(
  projectId: string,
  entry: ProjectActivity
): Promise<void> {
  await updateDoc(doc(db, PROJ, projectId), {
    activity:  arrayUnion(entry),
    updatedAt: new Date().toISOString(),
  });
}

/** Re-reads the project's tasks fresh inside a transaction rather than
 * trusting the caller's (possibly stale) local copy - two concurrent
 * callers each completing a different task will both survive instead of
 * one overwriting the other's stale snapshot of the whole array. */
export async function addTask(
  projectId: string,
  task: Task,
  author: { uid: string; name: string }
): Promise<void> {
  const ref = doc(db, PROJ, projectId);
  const now = new Date().toISOString();
  let statusChangedTo: ProjectStatus | undefined;

  await runTransaction(db, async (tx) => {
    const snap         = await tx.get(ref);
    const currentStatus = snap.data()?.status as ProjectStatus;
    const tasks         = [...((snap.data()?.tasks as Task[] | undefined) ?? []), task];
    const progress       = calcProgress(tasks);
    const status         = deriveProjectStatus(progress, currentStatus);
    if (status !== currentStatus) statusChangedTo = status;
    tx.update(ref, { tasks, progress, status, updatedAt: now });
  });

  const entry: ProjectActivity = {
    id:         crypto.randomUUID(),
    type:       "task_created",
    content:    `Task created: "${task.title}"`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  now,
  };
  await addProjectActivity(projectId, entry);

  if (statusChangedTo) {
    await addProjectActivity(projectId, {
      id:         crypto.randomUUID(),
      type:       "status_change",
      content:    `Status changed to ${PROJECT_STATUS_LABELS[statusChangedTo]}`,
      authorUid:  author.uid,
      authorName: author.name,
      createdAt:  now,
    });
  }
}

/** Same re-read-fresh-inside-a-transaction approach as addTask(). Logs a
 * "task_done" activity entry only on the transition TO "done" - not on
 * every status change - matching the original gap (task completion never
 * appeared in the activity log). */
export async function setTaskStatus(
  projectId: string,
  taskId: string,
  status: TaskStatus,
  author: { uid: string; name: string }
): Promise<void> {
  const ref = doc(db, PROJ, projectId);
  const now = new Date().toISOString();
  let completedTask: Task | undefined;
  let statusChangedTo: ProjectStatus | undefined;

  await runTransaction(db, async (tx) => {
    const snap          = await tx.get(ref);
    const currentStatus = snap.data()?.status as ProjectStatus;
    const current: Task[] = (snap.data()?.tasks as Task[] | undefined) ?? [];
    const tasks = current.map((t) => {
      if (t.id !== taskId) return t;
      if (status === "done" && t.status !== "done") completedTask = t;
      const { completedAt, ...rest } = t;
      return status === "done" ? { ...rest, status, completedAt: now } : { ...rest, status };
    });
    const progress     = calcProgress(tasks);
    const projectStatus = deriveProjectStatus(progress, currentStatus);
    if (projectStatus !== currentStatus) statusChangedTo = projectStatus;
    tx.update(ref, { tasks, progress, status: projectStatus, updatedAt: now });
  });

  if (completedTask) {
    const entry: ProjectActivity = {
      id:         crypto.randomUUID(),
      type:       "task_done",
      content:    `Task completed: "${completedTask.title}"`,
      authorUid:  author.uid,
      authorName: author.name,
      createdAt:  now,
    };
    await addProjectActivity(projectId, entry);
  }

  if (statusChangedTo) {
    await addProjectActivity(projectId, {
      id:         crypto.randomUUID(),
      type:       "status_change",
      content:    `Status changed to ${PROJECT_STATUS_LABELS[statusChangedTo]}`,
      authorUid:  author.uid,
      authorName: author.name,
      createdAt:  now,
    });
  }
}

export async function updateMilestones(projectId: string, milestones: Milestone[]): Promise<void> {
  await updateDoc(doc(db, PROJ, projectId), {
    milestones,
    updatedAt: new Date().toISOString(),
  });
}

export async function completeMilestone(
  projectId: string,
  milestoneId: string,
  milestones: Milestone[],
  author: { uid: string; name: string }
): Promise<void> {
  const now     = new Date().toISOString();
  const updated = milestones.map((m) =>
    m.id === milestoneId ? { ...m, completedAt: now } : m
  );
  const milestone = milestones.find((m) => m.id === milestoneId);
  const entry: ProjectActivity = {
    id:         crypto.randomUUID(),
    type:       "milestone_done",
    content:    `Milestone completed: "${milestone?.title ?? ""}"`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  now,
  };
  await updateDoc(doc(db, PROJ, projectId), {
    milestones: updated,
    activity:   arrayUnion(entry),
    updatedAt:  now,
  });
}

export async function addProjectFile(projectId: string, file: ProjectFile): Promise<void> {
  await updateDoc(doc(db, PROJ, projectId), {
    files:     arrayUnion(file),
    updatedAt: new Date().toISOString(),
  });
}

export async function removeProjectFile(
  projectId: string,
  file: ProjectFile
): Promise<void> {
  await updateDoc(doc(db, PROJ, projectId), {
    files:     arrayRemove(file),
    updatedAt: new Date().toISOString(),
  });
  await deleteObject(ref(storage, file.storagePath));
}

export async function linkProjectInvoice(
  projectId: string,
  invoiceId: string,
  invoiceRef: string
): Promise<void> {
  await updateDoc(doc(db, PROJ, projectId), { invoiceId, invoiceRef, updatedAt: new Date().toISOString() });
}

export async function deleteProject(project: Project): Promise<void> {
  await Promise.allSettled(
    (project.files ?? []).map((f) => deleteObject(ref(storage, f.storagePath)).catch(() => {}))
  );
  await deleteDoc(doc(db, PROJ, project.id));
}
