# Trace: What Happens When the User Clicks Delete on the Web App

This document traces the full flow from the Documents page delete action through the server and down to the workstation (virtual drive, monitored folder, and pending delete).

---

## 1. Web app (client)

**File:** `client/src/pages/Documents.tsx`

- User clicks delete on a document row.
- `handleDelete(id)` runs → `window.confirm(...)` → `deleteMutation.mutate(id)`.
- **Request:** `DELETE /api/documents/:id` (user auth: Bearer token).

The API base is typically something like `http://localhost:5002/api`, so the call is `DELETE /api/documents/16` (for example).

---

## 2. Server: document delete handler

**File:** `server/src/routes/documents.ts`  
**Route:** `router.delete('/:id', authenticateToken, ...)`  
So: **DELETE /api/documents/:id** (documents router is mounted under `/documents` or similar; confirm in app setup).

**Steps:**

1. Load document: `SELECT * FROM documents WHERE id = ?`
2. If not found → 404.
3. Check lock (must be unlockable by this user).
4. Log security event (document_delete).
5. **Archive** file if it has `fileStorageId` (optional).
6. **Delete file from server storage:**
   - If encrypted: `documentEncryptionService.deleteEncryptedFile(...)`
   - Else: `fs.unlinkSync(document.filePath)` on server disk.
7. **Delete DB row:** `DELETE FROM documents WHERE id = ?`  
   → Document no longer exists in DB.
8. Release any file lock: `fileLocking.forceReleaseLock(document.id)`.
9. **Optional: delete from “monitored folders” (server-side):**
   - Query workstations: `SELECT id, name, monitoredFolders, syncDeleteToServer FROM workstations WHERE isActive = 1`.
   - For each workstation with **syncDeleteToServer = 1** (and only those), resolve `monitoredFolders` paths on the **server** and, for the matching client folder, delete the file by name (`document.fileName`).
   - This only works when the server can see those paths (e.g. same machine or network share). If the monitored folder lives only on the workstation, this does nothing.
   - Workstations with **syncDeleteToServer = 0** are skipped here (server does **not** delete from their monitored folders).

**Important:** The server does **not** insert into `pending_delete_documents` and does **not** notify workstations. Workstations discover the deletion when they call **GET /workstation-sync/sync/all** and no longer see that document.

---

## 3. Workstation: how it learns the document is gone

The workstation runs a loop (e.g. in `gui_app.py` or `main.py`):

- **Sync from server** (e.g. every `virtual_drive_sync_interval`).
- **Sync to server** (same interval, after “sync from server”).
- **Periodic scan** of monitored folders (e.g. every `check_interval`).

Order in the loop is: **sync from server → sync to server → periodic scan**.

---

## 4. Sync from server (workstation)

**File:** `workstation-monitor/virtual_drive_sync.py` → `sync_from_server()`

1. **GET /workstation-sync/sync/all** (workstation API key).
   - Server runs: `SELECT d.*, c.firstName || " " || c.lastName as clientName FROM documents d LEFT JOIN clients c ON d.clientId = c.id`.
   - The deleted document is **no longer in the DB**, so it is **not** in the response.
2. Build `server_document_ids = { doc['id'] for doc in documents }` (only current DB docs).
3. For each document in the response: download/update file on virtual drive (normal sync). The deleted doc is never processed here.
4. **Orphan cleanup:** `_cleanup_orphaned_files(server_document_ids, documents)`:
   - Orphaned = IDs in `sync_state` but **not** in `server_document_ids` (e.g. doc id 16).
   - For each orphaned doc:
     - Get path from `sync_state` (e.g. virtual drive path `.../clients/Robert_Johnson/10_Bank_Statement.pdf`).
     - **Delete file from virtual drive:** `vd_path.unlink()`.
     - Get `client_name` from path: `vd_path.parts[clients_index + 1]` → e.g. **"Robert_Johnson"** (VD folder name, sanitized).
     - Call **`_delete_from_monitored_folder(filename, client_name)`**.

---

## 5. _delete_from_monitored_folder (workstation)

**File:** `workstation-monitor/virtual_drive_sync.py` → `_delete_from_monitored_folder(filename, client_name)`

- **If sync_delete_to_server is False (user setting “Sync manual file deletions to server” = OFF):**
  - Do **not** delete the file from the monitored folder (preserve it).
  - Call **`report_pending_delete_callback(client_name, filename)`**:
    - In GUI: `self.api.session.post(api_url + '/workstation-sync/pending-delete', json={ clientName, fileName })`.
  - Server receives **POST /workstation-sync/pending-delete** and inserts (or updates) a row in **`pending_delete_documents`** (clientId, fileName, workstationId).  
  - Server resolves client by name; if the name is sanitized (e.g. `"Robert_Johnson"`), it tries the same string with underscores replaced by spaces (`"Robert Johnson"`) so the client is found.
- **If sync_delete_to_server is True:**  
  - Find the client folder in each monitored folder (by matching sanitized name) and **delete** the file from disk there.

So: when the user has “sync delete” **off**, the file stays in the monitored folder and the workstation **reports** it as pending delete; the server only records that in `pending_delete_documents`.

---

## 6. Sync to server (workstation)

**File:** `workstation-monitor/virtual_drive_sync.py` → `sync_to_server()`

1. **GET /workstation-sync/sync/all** again → same list (still no deleted doc).
2. Build `server_documents_set` and, when sync delete is off, **GET /workstation-sync/pending-delete-list** → `pending_delete_set` (clientId, fileName) for this workstation.
3. For each file **on the virtual drive**:
   - If the file matches a document in the response → normal “sync existing doc” (upload if changed, etc.).
   - If the file **does not** match any document (e.g. it was deleted on the server):
     - If `(client_id, filename_lower)` is in **pending_delete_set** → **skip upload** and log “Preserved (pending delete), skipping upload: …”.
     - Otherwise → treat as “new file” and upload (re-upload).

Because we already removed the file from the virtual drive in step 4 (orphan cleanup), normally the “sync to server” step does not see that file at all. The pending-delete check is a safeguard for cases where the file might still appear in the VD (e.g. timing or another code path).

---

## 7. Periodic scan (folder monitor)

**File:** `workstation-monitor/gui_app.py` or `main.py` → folder monitor / `process_folder` → upload path.

- Scans **monitored folders** (e.g. `server/test_documents/Robert Johnson/`).
- Finds files on disk (e.g. still **7** files, including `10_Bank_Statement.pdf`, because we **preserved** it when sync delete is off).
- For each client folder, calls **upload** logic:
  - Reconcile with server: **POST /workstation-sync/check-documents-exist** → which filenames exist for this client. The deleted doc is **not** in the DB, so that file is “missing on server”.
  - If “sync delete” is off, **GET /workstation-sync/pending-delete-list** → `pending_delete_set`.
  - For each file we consider “already uploaded” locally but “missing on server”:
    - If `(client_id, filename_lower)` is in **pending_delete_set** → do **not** clear upload state and do **not** re-upload; log “Preserved (pending delete), sync paused: …”.
    - Otherwise → clear upload state and re-upload (reconcile).

So: the **periodic scan** is what would otherwise re-upload the preserved file. The **pending_delete_set** check (and the server’s `pending_delete_documents` table) is what prevents that re-upload and keeps the doc in “pending delete” state in the UI.

---

## 8. Web app: Documents list and “Pending delete”

**File:** `server/src/routes/documents.ts` (GET /documents or similar) and client `Documents.tsx`.

- Server loads documents and **pending-delete** rows (e.g. from `pending_delete_documents` for the current user’s context / workstation).
- Documents that are in **pending_delete_documents** (for this workstation) are marked as **pending delete** (e.g. `isPendingDelete`) and shown with “Pending delete · sync paused” and an **Upload** button to **restore** (re-upload and remove from pending delete).

So the “delete” flow ends with:

- Document removed from DB and from server file storage.
- On the workstation: file removed from virtual drive; file **kept** in monitored folder when “sync delete” is off; server told about that via **POST /workstation-sync/pending-delete**.
- Later sync/scan: workstation does **not** re-upload that file because it’s in **pending_delete_set** (from **GET /workstation-sync/pending-delete-list**).
- Web app shows the doc as “Pending delete” and allows restore via Upload.

---

## Summary flow (short)

1. **Web:** User deletes → **DELETE /api/documents/:id** (user auth).
2. **Server:** Delete file from disk, **DELETE FROM documents**, optionally delete from server-visible monitored folders only for workstations with sync delete **on**; **no** pending_delete insert here.
3. **Workstation – sync from server:** **GET /workstation-sync/sync/all** → doc no longer in list → orphan cleanup removes file from VD and calls **`_delete_from_monitored_folder`**.
4. **Workstation – _delete_from_monitored_folder:** If sync delete **off**: keep file in monitored folder and **POST /workstation-sync/pending-delete** → server inserts **pending_delete_documents**.
5. **Workstation – sync to server:** Uses **GET /workstation-sync/pending-delete-list** and skips uploading any file in that set (and VD file for that doc was already removed in step 3).
6. **Workstation – periodic scan:** For “missing on server” files, checks **pending_delete_set**; if the file is in it, skips re-upload and logs “Preserved (pending delete), sync paused”.
7. **Web:** GET documents + pending-delete data → doc shown as “Pending delete · sync paused” with Upload to restore.

This is the full trace from “user selected delete on the web app” through server and workstation behavior.
