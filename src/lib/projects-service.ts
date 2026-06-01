import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db, storage } from "./firebase";
import { ref, deleteObject } from "firebase/storage";
import type {
  Project, Task, Milestone, ProjectActivity, ProjectStatus, TaskStatus, ProjectFile,
} from "@/types/projects";
import { calcProgress, PROJECT_STATUS_LABELS } from "@/types/projects";

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

export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
  author: { uid: string; name: string }
): Promise<void> {
  const entry: ProjectActivity = {
    id:         Date.now().toString(),
    type:       "status_change",
    content:    `Status changed to ${PROJECT_STATUS_LABELS[status]}`,
    authorUid:  author.uid,
    authorName: author.name,
    createdAt:  new Date().toISOString(),
  };
  await updateDoc(doc(db, PROJ, projectId), {
    status,
    updatedAt: new Date().toISOString(),
    activity:  arrayUnion(entry),
  });
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

export async function updateTasks(projectId: string, tasks: Task[]): Promise<void> {
  const progress = calcProgress(tasks);
  await updateDoc(doc(db, PROJ, projectId), {
    tasks,
    progress,
    updatedAt: new Date().toISOString(),
  });
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
    id:         Date.now().toString(),
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
