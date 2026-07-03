"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getProject, putProjectOnHold, takeProjectOffHold, addProjectActivity,
  addTask, setTaskStatus, completeMilestone, addProjectFile, removeProjectFile, deleteProject,
} from "@/lib/projects-service";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { notifyMilestoneComplete, notifyAssignment } from "@/lib/notifications-service";
import { getStaffList, type StaffMember } from "@/lib/tickets-service";
import { getInvoices } from "@/lib/finance-service";
import {
  PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES,
  PROJECT_TYPE_LABELS, TASK_STATUS_LABELS, TASK_STATUS_STYLES,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_STYLES,
  formatProjDate, formatProjDateTime, calcProgress,
  ACCEPTED_FILE_MIME, MAX_FILE_SIZE, formatFileSize,
} from "@/types/projects";
import type { Project, Task, TaskStatus, TaskPriority, ProjectStatus, ProjectActivity, ProjectFile } from "@/types/projects";
import type { Invoice } from "@/types/finance";
import { formatNaira, formatDate } from "@/types/finance";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission, isRootAdmin } from "@/types/roles";
import { cn } from "@/lib/utils";

const TASK_COLS: TaskStatus[] = ["todo", "in_progress", "done"];

export default function ProjectDetailPage() {
  const { id }      = useParams() as { id: string };
  const router      = useRouter();
  const { profile } = useAuth();

  const [project, setProject]   = useState<Project | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [staff, setStaff]       = useState<StaffMember[]>([]);
  const [loading, setLoading]   = useState(true);

  // New task form
  const [taskTitle, setTaskTitle]       = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue]           = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [addingTask, setAddingTask]     = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);

  // Note
  const [noteText, setNoteText]         = useState("");
  const [addingNote, setAddingNote]     = useState(false);

  const fileInputRef                  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !project || !profile) return;

    if (!ACCEPTED_FILE_MIME.includes(file.type)) {
      setUploadError("File type not allowed. Accepted: PDF, Word, Excel, PowerPoint, PNG, JPG, ZIP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File exceeds the 20 MB limit.");
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const fileId      = crypto.randomUUID();
      const safeName    = file.name.replace(/[#?[\]*/\\]/g, "_");
      const path        = `projects/${project.id}/${fileId}_${safeName}`;
      const sRef        = storageRef(storage, path);
      const snapshot    = await uploadBytes(sRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      const projectFile: ProjectFile = {
        id:             fileId,
        name:           file.name,
        storagePath:    path,
        downloadUrl,
        size:           file.size,
        mimeType:       file.type,
        uploadedBy:     profile.uid,
        uploadedByName: profile.displayName ?? profile.email,
        uploadedAt:     new Date().toISOString(),
      };

      await addProjectFile(project.id, projectFile);
      setProject((prev) => prev ? { ...prev, files: [...(prev.files ?? []), projectFile] } : prev);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteFile(file: ProjectFile) {
    if (!project || !profile || deletingFileId) return;
    setDeletingFileId(file.id);
    try {
      await removeProjectFile(project.id, file);
      setProject((prev) =>
        prev ? { ...prev, files: (prev.files ?? []).filter((f) => f.id !== file.id) } : prev
      );
      setUploadError(null);
    } catch {
      setUploadError("Failed to delete file. Please try again.");
    } finally {
      setDeletingFileId(null);
    }
  }

  const canManage   = profile ? hasPermission(profile.role, "manage:projects") : false;
  const canFinance  = profile ? hasPermission(profile.role, "manage:finance") : false;
  const isAdmin     = profile ? isRootAdmin(profile.role) : false;
  const isOnTeam    = project?.team.some((m) => m.uid === profile?.uid) ?? false;
  const canEdit     = canManage || isOnTeam;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]                   = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getProject(id), getInvoices(), getStaffList()])
      .then(([proj, invs, s]) => {
        setProject(proj);
        setStaff(s);
        if (proj) {
          // Exact match (normalized) — see crm/clients/[id]/page.tsx for
          // why this is no longer a substring match.
          const co = proj.clientName.toLowerCase().trim();
          setInvoices(invs.filter((i) => i.client.name.toLowerCase().trim() === co));
        }
      }).finally(() => setLoading(false));
  }, [id]);

  async function handleToggleHold() {
    if (!project || !profile) return;
    const author = { uid: profile.uid, name: profile.displayName ?? profile.email };
    let newStatus: ProjectStatus;
    if (project.status === "on_hold") {
      newStatus = await takeProjectOffHold(project.id, author);
    } else {
      await putProjectOnHold(project.id, author);
      newStatus = "on_hold";
    }
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "projects", entityId: project.id, entityRef: project.name, details: `Project "${project.name}" status changed to ${PROJECT_STATUS_LABELS[newStatus]}`, timestamp: new Date().toISOString() });
    setProject((prev) => prev ? { ...prev, status: newStatus } : prev);
  }

  async function handleAddNote() {
    if (!project || !profile || !noteText.trim()) return;
    setAddingNote(true);
    try {
      const entry: ProjectActivity = {
        id:         crypto.randomUUID(),
        type:       "note",
        content:    noteText.trim(),
        authorUid:  profile.uid,
        authorName: profile.displayName ?? profile.email,
        createdAt:  new Date().toISOString(),
      };
      await addProjectActivity(project.id, entry);
      setProject((prev) => prev ? { ...prev, activity: [...prev.activity, entry] } : prev);
      setNoteText("");
    } finally { setAddingNote(false); }
  }

  async function handleAddTask() {
    if (!project || !profile || !taskTitle.trim() || !taskAssignee) return;
    setAddingTask(true);
    try {
      const member = staff.find((s) => s.uid === taskAssignee);
      const task: Task = {
        id:           crypto.randomUUID(),
        title:        taskTitle.trim(),
        assignedTo:   taskAssignee,
        assignedName: member?.displayName ?? taskAssignee,
        status:       "todo",
        priority:     taskPriority,
        dueDate:      taskDue || undefined,
        createdAt:    new Date().toISOString(),
        createdBy:    profile.uid,
      };
      await addTask(project.id, task, { uid: profile.uid, name: profile.displayName ?? profile.email });
      const newTasks = [...(project.tasks ?? []), task];
      setProject((prev) => prev ? { ...prev, tasks: newTasks, progress: calcProgress(newTasks) } : prev);

      if (taskAssignee !== profile.uid) {
        notifyAssignment({
          type:         "task_assigned",
          title:        "Task Assigned to You",
          message:      `You have been assigned "${task.title}" in project "${project.name}".`,
          link:         `/dashboard/projects/${project.id}`,
          assigneeUid:  taskAssignee,
          assigneeName: member?.displayName ?? taskAssignee,
          dedupeKey:    `task-assigned-${project.id}-${task.id}-${taskAssignee}`,
        }).catch(() => {});
      }

      setTaskTitle(""); setTaskAssignee(""); setTaskDue(""); setShowTaskForm(false);
    } finally { setAddingTask(false); }
  }

  async function handleTaskStatusChange(taskId: string, status: TaskStatus) {
    if (!project || !profile) return;
    if (!canManage) {
      const task = project.tasks.find((t) => t.id === taskId);
      if (!task || task.assignedTo !== profile.uid) return;
    }
    const now = new Date().toISOString();
    await setTaskStatus(project.id, taskId, status, { uid: profile.uid, name: profile.displayName ?? profile.email });
    const newTasks = project.tasks.map((t) =>
      t.id === taskId ? { ...t, status, completedAt: status === "done" ? now : undefined } : t
    );
    setProject((prev) => prev ? { ...prev, tasks: newTasks, progress: calcProgress(newTasks) } : prev);
  }

  async function handleDeleteProject() {
    if (!project || !isAdmin) return;
    setDeleting(true);
    try {
      await deleteProject(project);
      router.push("/dashboard/projects");
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleMilestoneDone(msId: string) {
    if (!project || !profile) return;
    const milestone = project.milestones.find((m) => m.id === msId);
    await completeMilestone(project.id, msId, project.milestones, { uid: profile.uid, name: profile.displayName ?? profile.email });
    logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "update", module: "projects", entityId: project.id, entityRef: project.name, details: `Milestone completed: "${milestone?.title}" on project "${project.name}"`, timestamp: new Date().toISOString() });
    if (milestone) {
      notifyMilestoneComplete({ id: project.id, name: project.name }, milestone).catch(() => {});
    }
    const updated = await getProject(project.id);
    setProject(updated);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!project) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">Project not found.</p></div>;
  }

  const sortedActivity = [...(project.activity ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="animate-fade-in max-w-6xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-helvetica mb-6 transition-colors">
        <BackIcon /> Back to Projects
      </button>

      {/* Header */}
      <div className="surface-card p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-orbitron text-xs text-accent">{project.projectId}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", PROJECT_STATUS_STYLES[project.status])}>
                {PROJECT_STATUS_LABELS[project.status]}
              </span>
              <span className="text-[10px] text-white/30 font-helvetica border border-white/10 px-2 py-0.5 rounded-full">
                {PROJECT_TYPE_LABELS[project.type]}
              </span>
            </div>
            <h2 className="font-orbitron text-xl font-bold text-white">{project.name}</h2>
            <p className="text-white/40 text-sm font-helvetica mt-0.5">{project.clientName}</p>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            {project.budget != null && (
              <div className="text-right">
                <p className="font-orbitron text-xl font-bold text-secondary">{formatNaira(project.budget)}</p>
                <p className="text-white/30 text-xs font-helvetica">budget</p>
              </div>
            )}
            <div className="text-right">
              <p className="font-orbitron text-3xl font-bold text-accent">{project.progress}%</p>
              <p className="text-white/30 text-xs font-helvetica">complete</p>
            </div>
          </div>
        </div>
        <div className="mt-4 w-full bg-white/10 rounded-full h-2">
          <div className={cn("rounded-full h-2 transition-all", project.progress === 100 ? "bg-emerald-400" : "bg-accent")} style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">

          {/* Description */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Description</h3>
            <p className="text-white/70 text-sm font-helvetica leading-relaxed">{project.description}</p>
          </div>

          {/* Files */}
          <div className="surface-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">
                Files ({(project.files ?? []).length})
              </h3>
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {uploading ? <><Spinner /> Uploading…</> : "+ Attach File"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip"
                    onChange={handleFileUpload}
                  />
                </>
              )}
            </div>

            {uploadError && (
              <p className="text-xs text-red-400 font-helvetica mb-3">{uploadError}</p>
            )}

            {(project.files ?? []).length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No files attached yet.</p>
            ) : (
              <div className="space-y-2">
                {(project.files ?? []).map((file) => (
                  <div key={file.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02]">
                    <FileTypeChip mimeType={file.mimeType} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-helvetica truncate">{file.name}</p>
                      <p className="text-[10px] text-white/30 font-helvetica">
                        {file.uploadedByName} · {formatProjDateTime(file.uploadedAt)} · {formatFileSize(file.size)}
                      </p>
                    </div>
                    <a
                      href={file.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-accent border border-accent/20 px-2 py-1 rounded-lg font-helvetica hover:bg-accent/10 transition-colors shrink-0"
                    >
                      Download
                    </a>
                    {canManage && (
                      <button
                        onClick={() => handleDeleteFile(file)}
                        disabled={deletingFileId === file.id}
                        className="text-white/20 hover:text-red-400 transition-colors shrink-0 ml-1 disabled:opacity-40"
                        title="Delete file"
                        aria-label={`Delete ${file.name}`}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Milestones */}
          {project.milestones.length > 0 && (
            <div className="surface-card p-6">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Milestones</h3>
              <div className="space-y-2">
                {project.milestones.map((ms) => (
                  <div key={ms.id} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border", ms.completedAt ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]")}>
                    <button
                      disabled={!!ms.completedAt || !canManage}
                      onClick={() => !ms.completedAt && handleMilestoneDone(ms.id)}
                      className={cn("w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                        ms.completedAt ? "bg-emerald-500/30 border-emerald-500/50 text-emerald-400" : "border-white/20 hover:border-accent/50"
                      )}
                    >
                      {ms.completedAt && <CheckIcon />}
                    </button>
                    <div className="flex-1">
                      <p className={cn("text-sm font-helvetica", ms.completedAt ? "line-through text-white/30" : "text-white")}>{ms.title}</p>
                    </div>
                    <p className="text-xs text-white/30 font-helvetica shrink-0">{formatProjDate(ms.dueDate)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks */}
          <div className="surface-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest">
                Tasks ({project.tasks.length})
              </h3>
              {canManage && (
                <button onClick={() => setShowTaskForm((v) => !v)} className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors">
                  {showTaskForm ? "Cancel" : "+ Add Task"}
                </button>
              )}
            </div>

            {showTaskForm && canManage && (
              <div className="mb-5 p-4 bg-white/[0.03] border border-white/10 rounded-xl animate-slide-up">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="sm:col-span-2">
                    <label className="field-label">Task Title</label>
                    <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="What needs to be done?" className="input-field" />
                  </div>
                  <div>
                    <label className="field-label">Assign To</label>
                    <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className="input-field">
                      <option value="">Select team member…</option>
                      {project.team.map((m) => <option key={m.uid} value={m.uid} className="bg-primary-dark">{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Priority</label>
                    <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)} className="input-field">
                      <option value="low"    className="bg-primary-dark">Low</option>
                      <option value="medium" className="bg-primary-dark">Medium</option>
                      <option value="high"   className="bg-primary-dark">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Due Date (optional)</label>
                    <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="input-field" />
                  </div>
                </div>
                <button onClick={handleAddTask} disabled={addingTask || !taskTitle.trim() || !taskAssignee} className="btn-primary text-xs px-4 py-2.5">
                  {addingTask ? <><Spinner /> Adding…</> : "Add Task"}
                </button>
              </div>
            )}

            {project.tasks.length === 0 ? (
              <p className="text-white/20 text-sm font-helvetica">No tasks yet.</p>
            ) : (
              <div className="space-y-4">
                {TASK_COLS.map((col) => {
                  const colTasks = project.tasks.filter((t) => {
                    if (t.status !== col) return false;
                    if (!canManage && !isOnTeam) return t.assignedTo === profile?.uid;
                    return true;
                  });
                  if (colTasks.length === 0) return null;
                  return (
                    <div key={col}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border font-helvetica", TASK_STATUS_STYLES[col])}>
                          {TASK_STATUS_LABELS[col]}
                        </span>
                        <span className="text-[10px] text-white/20 font-helvetica">{colTasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {colTasks.map((task) => (
                          <div key={task.id} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border", col === "done" ? "border-emerald-500/10 bg-emerald-500/[0.03]" : "border-white/8 bg-white/[0.02]")}>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm font-helvetica", col === "done" ? "line-through text-white/30" : "text-white")}>{task.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <p className="text-[10px] text-white/30 font-helvetica">{task.assignedName}</p>
                                {task.dueDate && <p className="text-[10px] text-white/25 font-helvetica">Due {formatProjDate(task.dueDate)}</p>}
                                <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border font-helvetica", TASK_PRIORITY_STYLES[task.priority])}>
                                  {TASK_PRIORITY_LABELS[task.priority]}
                                </span>
                              </div>
                            </div>
                            {profile && (canManage || task.assignedTo === profile.uid) && col !== "done" && (
                              <div className="flex gap-1.5 shrink-0">
                                {col === "todo" && (
                                  <button onClick={() => handleTaskStatusChange(task.id, "in_progress")} className="text-[10px] text-amber-400 border border-amber-500/20 px-2 py-1 rounded-lg font-helvetica hover:bg-amber-500/10 transition-colors">
                                    Start
                                  </button>
                                )}
                                <button onClick={() => handleTaskStatusChange(task.id, "done")} className="text-[10px] text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg font-helvetica hover:bg-emerald-500/10 transition-colors">
                                  Done
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity log */}
          <div className="surface-card p-6">
            <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Activity</h3>
            <div className="space-y-2 mb-4">
              {sortedActivity.map((e) => (
                <div key={e.id} className={cn("px-4 py-3 rounded-xl border text-sm font-helvetica",
                  e.type === "note"           && "border-white/10 bg-white/[0.02]",
                  e.type === "status_change"  && "border-secondary/20 bg-secondary/5",
                  e.type === "milestone_done" && "border-emerald-500/20 bg-emerald-500/5",
                  e.type === "task_done"      && "border-emerald-500/10 bg-emerald-500/[0.03]",
                  e.type === "task_created"   && "border-accent/15 bg-accent/5",
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white/50">{e.authorName}</span>
                    <span className="text-[10px] text-white/20 ml-auto">{formatProjDateTime(e.createdAt)}</span>
                  </div>
                  <p className="text-white/60">{e.content}</p>
                </div>
              ))}
            </div>
            {canEdit && (
              <div>
                <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} placeholder="Add a note…" className="input-field resize-none mb-2" />
                <button onClick={handleAddNote} disabled={addingNote || !noteText.trim()} className="btn-primary text-xs px-4 py-2.5">
                  {addingNote ? "Adding…" : "Add Note"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="surface-card p-5 space-y-2">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Details</p>
            <InfoRow label="Client"   value={project.clientName} />
            <InfoRow label="Type"     value={PROJECT_TYPE_LABELS[project.type]} />
            <InfoRow label="Start"    value={formatProjDate(project.startDate)} />
            <InfoRow label="Deadline" value={formatProjDate(project.deadline)} />
            <InfoRow label="Created"  value={formatProjDateTime(project.createdAt)} />
          </div>

          <div className="surface-card p-5">
            <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Team ({project.team.length})</p>
            <div className="space-y-2">
              {project.team.map((m) => (
                <div key={m.uid} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center text-[10px] font-bold text-secondary shrink-0">
                    {m.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white font-helvetica leading-none">{m.name}</p>
                    <p className="text-[10px] text-white/30 font-helvetica">{m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canManage && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Status</p>
              <p className="text-[11px] text-white/30 font-helvetica mb-3">
                Auto-derived from task completion. &quot;On Hold&quot; is the one manual override.
              </p>
              <button onClick={handleToggleHold} className={cn("w-full text-xs px-3 py-2 rounded-lg border font-helvetica text-left hover:opacity-80 transition-opacity", PROJECT_STATUS_STYLES[project.status === "on_hold" ? "in_progress" : "on_hold"])}>
                {project.status === "on_hold" ? "→ Take Off Hold" : "→ Put On Hold"}
              </button>
            </div>
          )}

          {/* Invoice link / raise */}
          {canFinance && project.budget != null && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Invoice</p>
              {project.invoiceId ? (
                <Link
                  href={`/dashboard/finance/invoices/${project.invoiceId}`}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 text-xs font-helvetica transition-colors"
                >
                  View Invoice {project.invoiceRef ? `(${project.invoiceRef})` : ""} →
                </Link>
              ) : (
                <Link
                  href={`/dashboard/finance/invoices/new?clientId=${encodeURIComponent(project.clientId ?? "")}&clientName=${encodeURIComponent(project.clientName)}&amount=${project.budget}&description=${encodeURIComponent(project.name)}&projectId=${encodeURIComponent(project.id)}`}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-secondary/30 text-secondary hover:bg-secondary/10 text-xs font-helvetica transition-colors"
                >
                  Raise Invoice →
                </Link>
              )}
            </div>
          )}

          {invoices.length > 0 && (
            <div className="surface-card p-5">
              <p className="font-orbitron text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Linked Invoices</p>
              <div className="space-y-2">
                {invoices.slice(0, 4).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-xs font-helvetica">
                    <span className="text-accent font-orbitron">{inv.invoiceNumber}</span>
                    <span className="text-white/50">{formatNaira(inv.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete Project — Root Admin only */}
          {isAdmin && (
            <div className="surface-card p-5">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full text-xs py-2 px-3 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 font-helvetica transition-colors"
              >
                Delete Project
              </button>
            </div>
          )}

          {/* Delete confirmation modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="surface-card p-6 max-w-sm w-full space-y-4 animate-fade-in">
                <h3 className="font-orbitron text-sm font-bold text-white">Delete Project?</h3>
                <p className="text-white/60 text-sm font-helvetica leading-relaxed">
                  This will permanently delete <span className="text-white font-semibold">{project.name}</span> and all attached files.{" "}
                  <span className="text-red-400">This cannot be undone.</span>
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteProject}
                    disabled={deleting}
                    className="flex-1 py-2 text-sm rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 font-helvetica transition-colors"
                  >
                    {deleting ? "Deleting…" : "Yes, Delete"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 text-sm text-white/40 hover:text-white font-helvetica transition-colors border border-white/10 hover:border-white/20 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs font-helvetica">
      <span className="text-white/30">{label}</span>
      <span className="text-white/60 text-right">{value}</span>
    </div>
  );
}
function BackIcon()  { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>; }
function CheckIcon() { return <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m20 6-11 11-5-5"/></svg>; }
function Spinner()   { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }

function FileTypeChip({ mimeType }: { mimeType: string }) {
  const label =
    mimeType.includes("pdf")                                              ? "PDF"  :
    mimeType.includes("word")                                             ? "DOC"  :
    mimeType.includes("sheet") || mimeType.includes("excel")             ? "XLS"  :
    mimeType.includes("presentation") || mimeType.includes("powerpoint") ? "PPT"  :
    mimeType.includes("image")                                            ? "IMG"  :
    mimeType.includes("zip")                                              ? "ZIP"  : "FILE";
  return (
    <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
      <span className="text-[8px] font-bold text-white/40 font-orbitron">{label}</span>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}
