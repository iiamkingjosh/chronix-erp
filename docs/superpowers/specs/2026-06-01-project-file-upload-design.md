# Project File Upload — Design Spec

**Date:** 2026-06-01  
**Module:** Projects (`/dashboard/projects`)  
**Status:** Approved

---

## Overview

Add file attachment support to the Projects module so that project managers can attach brief documents, specs, or reference files to a project, and the assigned team can view and download them from the project detail page. Files can be attached at project creation or added later on the detail page.

---

## Data Model

### New type: `ProjectFile`

Add to `src/types/projects.ts`:

```ts
export interface ProjectFile {
  id: string;           // uuid
  name: string;         // original filename (e.g. "brief.pdf")
  storagePath: string;  // Firebase Storage path: projects/{projectId}/{id}_{name}
  downloadUrl: string;  // Firebase Storage download URL (permanent)
  size: number;         // bytes
  mimeType: string;     // e.g. "application/pdf"
  uploadedBy: string;   // uid
  uploadedByName: string;
  uploadedAt: string;   // ISO 8601
}
```

### Updated `Project` interface

Add an optional field to the existing `Project` interface:

```ts
files?: ProjectFile[];
```

This field is omitted on older documents (treated as empty array) and populated as files are attached.

---

## Firebase Storage

### Initialization

Add `getStorage` to `src/lib/firebase.ts`:

```ts
import { getStorage } from "firebase/storage";
export const storage = getStorage(app);
```

### Storage path convention

```
projects/{firestoreDocId}/{uuid}_{originalFilename}
```

Using a UUID prefix prevents collisions when the same filename is uploaded twice.

### Accepted file types & limits

| Type | Extensions |
|------|-----------|
| Documents | `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx` |
| Images | `.png`, `.jpg`, `.jpeg` |
| Archives | `.zip` |

- Max file size: **20 MB** per file
- No limit on file count per project (practical limit from Firestore 1 MB doc size; metadata per file is ~200 bytes so ~5000 files before any issue — not a real concern)

---

## Service Layer

Add two functions to `src/lib/projects-service.ts`:

### `addProjectFile(projectId, file)`

Writes the `ProjectFile` metadata to the Firestore project document using `arrayUnion`. The caller is responsible for uploading to Firebase Storage and obtaining the download URL before calling this.

```ts
async function addProjectFile(projectId: string, file: ProjectFile): Promise<void>
```

### `removeProjectFile(projectId, file)`

Deletes the file from Firebase Storage (via `storagePath`) and removes the metadata entry from the Firestore `files` array using `arrayRemove`.

```ts
async function removeProjectFile(projectId: string, file: ProjectFile): Promise<void>
```

---

## Permissions

| Action | Who |
|--------|-----|
| View file list + download | Any user who can view the project (team members + managers) |
| Upload files | `canEdit` — team members AND managers |
| Delete files | `canManage` — managers only (CEO, CFO, Admin, Brand Lead) |

This maps to existing `canEdit` and `canManage` booleans already computed in the detail page.

---

## UI — Project Detail Page (`[id]/page.tsx`)

A new **"Files"** card is inserted in the main left column between the Description card and the Milestones card.

### File list (all viewers)

Each row shows:
- File type icon (PDF / image / document / archive)
- Filename
- Uploader name + upload date
- File size (human-readable: KB / MB)
- Download button (opens `downloadUrl` in new tab)
- Delete icon (trash) — visible to `canManage` only, confirms before deleting

Empty state: "No files attached yet." (with attach button below if `canEdit`)

### Upload (canEdit users)

An "Attach File" button triggers a hidden `<input type="file">`. On file select:
1. Validate type and size (show inline error if invalid)
2. Show upload progress indicator on the row
3. Upload to Firebase Storage → get download URL
4. Call `addProjectFile()` to persist metadata
5. Update local state to show the new file immediately

### Upload state

- While uploading: show a progress row with filename, spinner, and percentage
- On error: show inline red error message, allow retry

---

## UI — New Project Form (`new/page.tsx`)

Add an optional **"Project Files"** section at the bottom of the form (after Milestones, before the submit button).

- A file picker area ("Click to attach files, or drag and drop")
- Lists selected files with name, size, and a remove (×) button
- Files are **not** uploaded until after the project document is created
- Upload sequence on submit: create Firestore document → upload each file to Storage → call `addProjectFile()` for each → redirect to detail page
- If a file upload fails after the project is created, the project is still created successfully and the user sees an error noting which files failed (they can re-upload from the detail page)

---

## Activity Log

File uploads are **not** added to the project activity log. Files are a separate concern from the task/milestone/note activity stream. The Files card is its own section.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| File too large (>20MB) | Inline error before upload starts |
| Wrong file type | Inline error before upload starts |
| Storage upload fails | Inline error on the file row; file not added to Firestore |
| Delete fails | Toast/inline error; file remains in list |
| Download URL expired | Firebase Storage permanent download URLs don't expire by default |

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/firebase.ts` | Export `storage` from `getStorage` |
| `src/types/projects.ts` | Add `ProjectFile` interface; add `files?` to `Project` |
| `src/lib/projects-service.ts` | Add `addProjectFile`, `removeProjectFile` |
| `src/app/(dashboard)/dashboard/projects/[id]/page.tsx` | Add Files card with upload + list + delete |
| `src/app/(dashboard)/dashboard/projects/new/page.tsx` | Add optional file picker section; upload on submit |
