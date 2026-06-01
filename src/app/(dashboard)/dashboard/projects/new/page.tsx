"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { logAuditEvent } from "@/lib/audit-service";
import { hasPermission } from "@/types/roles";
import { createProject } from "@/lib/projects-service";
import { getStaffList, type StaffMember } from "@/lib/tickets-service";
import { getClients } from "@/lib/crm-service";
import { PROJECT_TYPE_LABELS, generateProjectId } from "@/types/projects";
import type { ProjectType, TeamMember, Milestone } from "@/types/projects";
import type { Client } from "@/types/crm";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { addProjectFile } from "@/lib/projects-service";
import type { ProjectFile } from "@/types/projects";
import { ACCEPTED_FILE_MIME, MAX_FILE_SIZE, formatFileSize } from "@/types/projects";

const milestoneSchema = z.object({
  title:   z.string().min(1, "Required"),
  dueDate: z.string().min(1, "Required"),
});

const schema = z.object({
  name:        z.string().min(2, "Required"),
  clientName:  z.string().min(1, "Required"),
  type:        z.enum(["web_dev","ui_ux","it_deployment","network","support","other"]),
  description: z.string().min(10, "Min 10 characters"),
  startDate:   z.string().min(1, "Required"),
  deadline:    z.string().min(1, "Required"),
  milestones:  z.array(milestoneSchema),
});

type FormData = z.infer<typeof schema>;

export default function NewProjectPage() {
  const { profile } = useAuth();
  const router      = useRouter();
  const [staff, setStaff]       = useState<StaffMember[]>([]);
  const [clients, setClients]   = useState<Client[]>([]);
  const [team, setTeam]         = useState<TeamMember[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError]       = useState<string | null>(null);

  function handlePendingFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_FILE_MIME.includes(file.type)) {
      setFileError("File type not allowed. Accepted: PDF, Word, Excel, PowerPoint, PNG, JPG, ZIP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("File exceeds the 20 MB limit.");
      return;
    }
    setFileError(null);
    setPendingFiles((prev) => [...prev, file]);
  }

  const canManage = profile ? hasPermission(profile.role, "manage:projects") : false;

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type:       "it_deployment",
      startDate:  new Date().toISOString().split("T")[0],
      milestones: [],
    },
  });

  const { fields: msFields, append: appendMs, remove: removeMs } = useFieldArray({ control, name: "milestones" });

  useEffect(() => {
    Promise.all([getStaffList(), getClients()]).then(([s, c]) => { setStaff(s); setClients(c); }).catch((e) => console.error("Failed to load staff/clients:", e));
  }, []);

  function toggleTeam(member: StaffMember) {
    setTeam((prev) =>
      prev.some((m) => m.uid === member.uid)
        ? prev.filter((m) => m.uid !== member.uid)
        : [...prev, { uid: member.uid, name: member.displayName, role: member.role }]
    );
  }

  async function onSubmit(data: FormData) {
    if (!profile || !canManage) return;
    setServerError(null);
    try {
      const now = new Date().toISOString();
      const milestoneIdBase = crypto.randomUUID();
      const milestones: Milestone[] = data.milestones.map((m, i) => ({
        id:      `ms-${i}-${milestoneIdBase}`,
        title:   m.title,
        dueDate: m.dueDate,
      }));
      const finalTeam = team.length > 0 ? team : [{ uid: profile.uid, name: profile.displayName ?? profile.email, role: "Project Lead" }];
      const proj = await createProject({
        projectId:   generateProjectId(),
        name:        data.name,
        clientName:  data.clientName,
        type:        data.type as ProjectType,
        description: data.description,
        status:      "not_started",
        team:        finalTeam,
        startDate:   data.startDate,
        deadline:    data.deadline,
        milestones,
        tasks:       [],
        activity: [{
          id:         crypto.randomUUID(),
          type:       "status_change",
          content:    "Project created",
          authorUid:  profile.uid,
          authorName: profile.displayName ?? profile.email,
          createdAt:  now,
        }],
        progress:   0,
        createdAt:  now,
        createdBy:  profile.uid,
        updatedAt:  now,
      });
      logAuditEvent({ actorUid: profile.uid, actorName: profile.displayName ?? profile.email, actorRole: profile.role, action: "create", module: "projects", entityId: proj.id, entityRef: proj.projectId, details: `Project created: ${data.name} for ${data.clientName}`, timestamp: now });
      for (const file of pendingFiles) {
        try {
          const fileId      = crypto.randomUUID();
          const safeName    = file.name.replace(/[#?[\]*]/g, "_");
          const path        = `projects/${proj.id}/${fileId}_${safeName}`;
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
            uploadedAt:     now,
          };
          await addProjectFile(proj.id, projectFile);
        } catch {
          // non-fatal — project is already created; file can be re-uploaded from the detail page
        }
      }
      router.push(`/dashboard/projects/${proj.id}`);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  if (!canManage) {
    return <div className="py-16 text-center"><p className="text-white/40 font-helvetica">You do not have permission to create projects.</p></div>;
  }

  return (
    <div className="animate-fade-in max-w-3xl">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* Basic info */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-5">Project Details</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Project Name</label>
                <input {...register("name")} placeholder="e.g. Retail Network Upgrade" className="input-field" />
                {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
              </div>
              <div>
                <label className="field-label">Client</label>
                <input
                  {...register("clientName")}
                  list="clients-list"
                  placeholder="Type or select client…"
                  className="input-field"
                />
                <datalist id="clients-list">
                  {clients.map((c) => <option key={c.id} value={c.company || c.fullName} />)}
                </datalist>
                {errors.clientName && <p className="mt-1 text-xs text-red-400">{errors.clientName.message}</p>}
              </div>
            </div>
            <div>
              <label className="field-label">Project Type</label>
              <select {...register("type")} className="input-field">
                {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([v, l]) => (
                  <option key={v} value={v} className="bg-primary-dark">{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Description</label>
              <textarea {...register("description")} rows={4} placeholder="Project scope, objectives, deliverables…" className="input-field resize-none" />
              {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Start Date</label>
                <input {...register("startDate")} type="date" className="input-field" />
              </div>
              <div>
                <label className="field-label">Deadline</label>
                <input {...register("deadline")} type="date" className="input-field" />
                {errors.deadline && <p className="mt-1 text-xs text-red-400">{errors.deadline.message}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Team */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Assign Team</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {staff.map((s) => {
              const selected = team.some((m) => m.uid === s.uid);
              return (
                <button
                  key={s.uid}
                  type="button"
                  onClick={() => toggleTeam(s)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all text-xs font-helvetica ${
                    selected
                      ? "bg-accent/15 border-accent/30 text-accent"
                      : "bg-white/[0.02] border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${selected ? "bg-accent/30" : "bg-white/10"}`}>
                    {s.displayName[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate">{s.displayName.split(" ")[0]}</p>
                    <p className="text-[9px] opacity-60 truncate">{s.role}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {team.length > 0 && (
            <p className="mt-3 text-xs text-accent font-helvetica">{team.length} member{team.length !== 1 ? "s" : ""} selected</p>
          )}
        </div>

        {/* Milestones */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Milestones (optional)</h3>
          <div className="space-y-2 mb-3">
            {msFields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[1fr_140px_36px] gap-2">
                <input {...register(`milestones.${i}.title`)} placeholder="Milestone title" className="input-field py-2.5 text-sm" />
                <input {...register(`milestones.${i}.dueDate`)} type="date" className="input-field py-2.5 text-sm" />
                <button type="button" onClick={() => removeMs(i)} className="w-9 h-9 flex items-center justify-center text-white/20 hover:text-red-400 border border-white/5 hover:border-red-500/20 rounded-lg transition-colors">
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => appendMs({ title: "", dueDate: "" })} className="text-xs text-accent hover:text-accent/80 font-helvetica transition-colors flex items-center gap-1.5">
            <PlusSmIcon /> Add Milestone
          </button>
        </div>

        {/* Project Files */}
        <div className="surface-card p-6">
          <h3 className="font-orbitron text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
            Project Files{" "}
            <span className="normal-case font-helvetica text-white/20 text-[10px] font-normal">(optional)</span>
          </h3>
          <div className="space-y-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-helvetica truncate">{f.name}</p>
                  <p className="text-[10px] text-white/30 font-helvetica">{formatFileSize(f.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-white/20 hover:text-red-400 transition-colors shrink-0"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            <label className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl border border-dashed border-white/10 hover:border-accent/30 cursor-pointer transition-colors text-sm text-white/30 hover:text-white/50 font-helvetica">
              <PlusSmIcon />
              Attach file
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip"
                onChange={handlePendingFile}
              />
            </label>
            {fileError && <p className="text-xs text-red-400 font-helvetica mt-1">{fileError}</p>}
          </div>
        </div>

        {serverError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-helvetica">{serverError}</p>
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <><Spinner /> Creating…</> : "Create Project"}
        </button>
      </form>
    </div>
  );
}

function TrashIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function PlusSmIcon() { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function Spinner() { return <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>; }
