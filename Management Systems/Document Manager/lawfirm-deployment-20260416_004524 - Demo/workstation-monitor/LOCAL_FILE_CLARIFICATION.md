# Local File Clarification

## Question
When we say "local file" in the context of conflict resolution, does it refer to:
1. The file in the **monitored folder** (`E:\Test Documents\...`)?
2. The file in the **virtual drive** (`C:\LAWFIRM\clients\...`)?

## Answer: **Virtual Drive** ✅

In the context of **timestamp-based conflict resolution**, "local file" refers to the file in the **Virtual Drive** (`C:\LAWFIRM\clients\...`).

## File Locations and Their Roles

### 1. Monitored Folder (`E:\Test Documents\...`)
- **Purpose**: Where users place files initially
- **Role**: Source for new document uploads
- **Process**: 
  - FolderMonitor watches this folder
  - Detects new files/folders
  - Uploads to server (if client exists)
- **Not used for**: Conflict resolution (that happens at virtual drive level)

### 2. Virtual Drive (`C:\LAWFIRM\clients\...`)
- **Purpose**: Working directory for synced files
- **Role**: 
  - **"Local"** in conflict resolution context
  - Files are decrypted here (from server)
  - Files are encrypted here (before upload to server)
  - This is where conflict resolution happens
- **Process**:
  - `sync_from_server()`: Downloads from server → Virtual Drive (decrypted)
  - `sync_to_server()`: Uploads from Virtual Drive → Server (encrypted)
  - Conflict resolution compares: Virtual Drive file vs Server file

### 3. Server Storage (`server/data/file-storage/files/clients/...`)
- **Purpose**: Central storage (encrypted)
- **Role**: Source of truth
- **Process**: Stores encrypted files with generated IDs

## The Sync Flow

```
┌─────────────────┐
│ Monitored Folder │
│ E:\Test Docs\   │
└────────┬────────┘
         │ (Initial upload)
         ▼
┌─────────────────┐
│     Server      │
│  (Encrypted)    │
└────────┬────────┘
         │ (sync_from_server)
         │ Downloads & Decrypts
         ▼
┌─────────────────┐
│  Virtual Drive  │ ← "LOCAL" in conflict resolution
│  C:\LAWFIRM\    │
└────────┬────────┘
         │ (sync_to_server)
         │ Encrypts & Uploads
         ▼
┌─────────────────┐
│     Server      │
│  (Encrypted)    │
└─────────────────┘
         │
         │ (After successful sync)
         ▼
┌─────────────────┐
│ Monitored Folder │
│ E:\Test Docs\   │ (Copied back)
└─────────────────┘
```

## Conflict Resolution Context

When we say "local file is newer":
- **Local** = Virtual Drive file (`C:\LAWFIRM\clients\Smart_man\oya.txt`)
- **Server** = Server file (encrypted, stored on server)
- **Comparison**: Virtual Drive modification time vs Server `lastSyncedAt`

## Why Virtual Drive is "Local"

1. **VirtualDriveSync class** works with virtual drive files
2. **Conflict detection** happens in `sync_from_server()` and `sync_to_server()`
3. **Both methods** operate on virtual drive files:
   - `sync_from_server()`: Compares virtual drive file vs server
   - `sync_to_server()`: Compares virtual drive file vs server

## Example from Our Test

When we wrote to `C:\LAWFIRM\clients\Smart_man\oya.txt`:
- This is the **virtual drive** file
- This is the **"local file"** in conflict resolution
- The system compared:
  - **Local (Virtual Drive)**: `C:\LAWFIRM\clients\Smart_man\oya.txt` (modified 18:31:38)
  - **Server**: Server's `lastSyncedAt` timestamp
  - **Result**: Local was newer, so it was preserved and uploaded

## Summary

- **"Local file"** = Virtual Drive file (`C:\LAWFIRM\clients\...`)
- **"Server file"** = Server storage (encrypted)
- **Monitored folder** = Initial upload source, gets copied back after sync

The conflict resolution happens at the **Virtual Drive ↔ Server** level, not at the monitored folder level.





