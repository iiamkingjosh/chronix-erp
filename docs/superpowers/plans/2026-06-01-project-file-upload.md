# Project File Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file attachment support to the Projects module so managers and team members can upload project briefs/documents at creation or later, and the assigned team can view and download them from the detail page.

**Architecture:** Firebase Storage holds the actual files at `projects/{projectId}/{uuid}_{filename}`; file metadata (name, URL, size, uploader, timestamp) is stored as a `files` array on the Firestore project document — consistent with how tasks and milestones are already stored. Storage upload is handled client-side in the UI; the service layer only wraps Firestore reads/writes plus the Storage delete on removal.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Firebase Storage (`firebase/storage`), Firestore (`firebase/firestore`)

---

## File Map

| File | Change |
|------|--------|
| `src/lib/firebase.ts` | Export `storage` from `getStorage` |
| `src/types/projects.ts` | Add `ProjectFile` interface, `files?` on `Project`, `ACCEPTED_FILE_MIME`, `MAX_FILE_SIZE`, `formatFileSize` |
| `src/lib/projects-service.ts` | Add `addProjectFile`, `removeProjectFile` |
| `src/app/(dashboard)/dashboard/projects/[id]/page.tsx` | Add Files card with upload, list, and delete |
| `src/app/(dashboard)/dashboard/projects/new/page.tsx` | Add optional file picker; upload files after project creation |

---

### Task 1: Initialize Firebase Storage

**Files:**
- Modify: `src/lib/firebase.ts`

- [ ] **Step 1: Add Storage export**

Replace the full contents of `src/lib/firebase.ts` with:

```ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export default app;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase.ts
git commit -m "feat: export Firebase Storage instance"
```

---

### Task 2: Add ProjectFile type, constants, and helper

**Files:**
- Modify: `src/types/projects.ts`

- [ ] **Step 1: Add `files?` to the `Project` interface**

In `src/types/projects.ts`, find the `Project` interface. Add `files?: ProjectFile[];` as the last field before the closing brace:

```ts
export interface Project {
  id: string;
  projectId: string;
  name: string;
  clientName: string;
  clientId?: string;
  type: ProjectType;
  description: string;
  status: ProjectStatus;
  team: TeamMember[];
  startDate: string;
  deadline: string;
  milestones: Milestone[];
  tasks: Task[];
  activity: ProjectActivity[];
  progress: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  files?: ProjectFile[];
}
```

- [ ] **Step 2: Add `ProjectFile` interface, constants, and `formatFileSize` helper**

Immediately after the closing `}` of the `Project` interface, insert:

```ts
export interface ProjectFile {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export const ACCEPTED_FILE_MIME: readonly string[] = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "application/zip",
  "application/x-zip-compressed",
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/projects.ts
git commit -m "feat: add ProjectFile type, file constants, and formatFileSize helper"
```

---

### Task 3: Add service functions for file metadata

**Files:**
- Modify: `src/lib/projects-service.ts`

- [ ] **Step 1: Update imports**

At the top of `src/lib/projects-service.ts`:

1. Change the existing Firebase import line from:
   ```ts
   import { db } from "./firebase";
   ```
   to:
   ```ts
   import { db, storage } from "./firebase";
   ```

2. Add a new import line directly below it:
   ```ts
   import { ref, deleteObject } from "firebase/storage";
   ```

3. Add `ProjectFile` to the type import already on the file:
   ```ts
   import type {
     Project, Task, Milestone, ProjectActivity, ProjectStatus, TaskStatus, ProjectFile,
   } from "@/types/projects";
   ```

- [ ] **Step 2: Add `addProjectFile` and `removeProjectFile` at the end of the file**

```ts
export async function addProjectFile(projectId: string, file: ProjectFile): Promise<void> {
  await updateDoc(doc(db, PROJ, projectId), {
    files:     arrayUnion(file),
    updatedAt: new Date().toISOString(),
  });
}

export async function removeProjectFile(
  projectId: string,
  file: ProjectFile,
  currentFiles: ProjectFile[]
): Promise<void> {
  await deleteObject(ref(storage, file.storagePath));
  const updatedFiles = currentFiles.filter((f) => f.id !== file.id);
  await updateDoc(doc(db, PROJ, projectId), {
    files:     updatedFiles,
    updatedAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/projects-service.ts
git commit -m "feat: add addProjectFile and removeProjectFile service functions"
```

---

### Task 4: Add Files card to the project detail page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/projects/[id]/page.tsx`

- [ ] **Step 1: Extend the React import to include `useRef`**

Find the top of the file:
```ts
import { useEffect, useState } from "react";
```
Replace with:
```ts
import { useEffect, useState, useRef } from "react";
```

- [ ] **Step 2: Add Storage and file-service imports**

After the existing `import { getStaffList ... } from "@/lib/tickets-service";` line, add:

```ts
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
```

Update the destructured import from `@/lib/projects-service` to include the two new functions:

```ts
import {
  getProject, updateProjectStatus, addProjectActivity,
  updateTasks, completeMilestone, addProjectFile, removeProjectFile,
} from "@/lib/projects-service";
```

Update the type import from `@/types/projects` to include `ProjectFile`:

```ts
import type { Project, Task, TaskStatus, TaskPriority, ProjectStatus, ProjectActivity, ProjectFile } from "@/types/projects";
```

Update the named import from `@/types/projects` to include the new exports:

```ts
import {
  PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES,
  PROJECT_TYPE_LABELS, TASK_STATUS_LABELS, TASK_STATUS_STYLES,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_STYLES,
  formatProjDate, formatProjDateTime, calcProgress,
  ACCEPTED_FILE_MIME, MAX_FILE_SIZE, formatFileSize,
} from "@/types/projects";
```

- [ ] **Step 3: Add file state and handlers inside `ProjectDetailPage`**

After the existing `const [addingNote, setAddingNote] = useState(false);` line, insert:

```ts
const fileInputRef                  = useRef<HTMLInputElement>(null);
const [uploading, setUploading]     = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);

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
    const path        = `projects/${project.id}/${fileId}_${file.name}`;
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
  if (!project || !profile) return;
  try {
    await removeProjectFile(project.id, file, project.files ?? []);
    setProject((prev) =>
      prev ? { ...prev, files: (prev.files ?? []).filter((f) => f.id !== file.id) } : prev
    );
  } catch {
    setUploadError("Failed to delete file. Please try again.");
  }
}
```

- [ ] **Step 4: Insert the Files card into the JSX**

In the JSX, locate the closing `</div>` of the Description card (the block that starts with `{/* Description */}`). Insert the following block immediately after it:

```tsx
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
              className="text-white/20 hover:text-red-400 transition-colors shrink-0 ml-1"
              title="Delete file"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 5: Add helper components at the bottom of the file**

After the existing `function Spinner()` at the bottom, add:

```tsx
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
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/dashboard/projects/[id]/page.tsx"
git commit -m "feat: add Files card to project detail page with upload and delete"
```

---

### Task 5: Add file picker to the new project form

**Files:**
- Modify: `src/app/(dashboard)/dashboard/projects/new/page.tsx`

- [ ] **Step 1: Add new imports**

At the top of `new/page.tsx`, after the existing imports, add:

```ts
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { addProjectFile } from "@/lib/projects-service";
import type { ProjectFile } from "@/types/projects";
import { ACCEPTED_FILE_MIME, MAX_FILE_SIZE, formatFileSize } from "@/types/projects";
```

- [ ] **Step 2: Add pending-files state and handler inside `NewProjectPage`**

After the existing `const [serverError, setServerError] = useState<string | null>(null);` line, add:

```ts
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
```

- [ ] **Step 3: Upload pending files inside `onSubmit` before redirecting**

In the `onSubmit` function, find the line:
```ts
      router.push(`/dashboard/projects/${proj.id}`);
```

Replace it with:

```ts
      for (const file of pendingFiles) {
        try {
          const fileId      = crypto.randomUUID();
          const path        = `projects/${proj.id}/${fileId}_${file.name}`;
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
```

- [ ] **Step 4: Insert the Project Files card into the JSX**

In the form JSX, find the `{serverError && ...}` block. Insert the following card immediately before it:

```tsx
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
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/projects/new/page.tsx"
git commit -m "feat: add optional file picker to new project form"
```

---

### Task 6: Build verification and smoke test

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: exits 0. Size warnings for large page bundles are not failures.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Smoke test — detail page**

Open any existing project detail page. Verify:
1. A "Files (0)" card appears between the Description and Milestones cards
2. As a `canEdit` user: click "+ Attach File" → select a PDF → file row appears with name, uploader, date, size, and Download link
3. Click "Download" → file opens in a new browser tab
4. As a `canManage` user: a trash icon is visible on each file row; clicking it removes the file from the list
5. Try selecting a `.exe` or unsupported file → inline red error appears, no upload starts
6. Try a file over 20 MB → inline error "File exceeds the 20 MB limit" appears

- [ ] **Step 4: Smoke test — new project form**

Navigate to `/dashboard/projects/new`. Verify:
1. A "Project Files (optional)" card appears above the submit button
2. Clicking "Attach file" opens the OS file picker
3. A selected file appears in the list with its name and size
4. Clicking × on a file removes it from the pending list
5. Submitting the form with an attached file creates the project and redirects to the detail page, where the file appears in the Files card

- [ ] **Step 5: Commit any minor fixes found during smoke test**

Only run if you made corrections during testing:

```bash
git add -A
git commit -m "fix: post-smoke-test corrections for project file upload"
```
