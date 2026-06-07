# Monitored Folder Update Behavior

## Question
Are files in the monitored folder updated after sync?

## Answer: **PARTIALLY** ⚠️

Files in the monitored folder are updated, but **only in one direction**:

### ✅ Updated: After Upload to Server
- When a file is **uploaded** from virtual drive to server (`sync_to_server()`)
- After successful upload, the file is **copied back** to monitored folder
- This happens in `_copy_to_monitored_folder()` function

### ❌ NOT Updated: After Download from Server
- When a file is **downloaded** from server to virtual drive (`sync_from_server()`)
- The file is **NOT copied** to monitored folder
- Only the virtual drive gets updated

## Current Behavior

### Upload Flow (Virtual Drive → Server)
```
Virtual Drive (modified)
    ↓
Upload to Server ✅
    ↓
Copy to Monitored Folder ✅ (happens here)
```

### Download Flow (Server → Virtual Drive)
```
Server (updated)
    ↓
Download to Virtual Drive ✅
    ↓
Copy to Monitored Folder ❌ (does NOT happen)
```

## Code Evidence

Looking at `virtual_drive_sync.py`:

1. **sync_to_server()** (line 608):
   ```python
   # Copy file to monitored folder if configured
   copy_successful = self._copy_to_monitored_folder(...)
   ```
   ✅ Copies after upload

2. **sync_from_server()** (line 250+):
   - Downloads file to virtual drive
   - Updates sync state
   - ❌ Does NOT call `_copy_to_monitored_folder()`

## Why This Happens

The design assumes:
- **Monitored folder** = Source for initial uploads
- **Virtual drive** = Working directory for synced files
- Files are copied back to monitored folder **only after upload** to keep it in sync with what was uploaded

## Limitations

1. **One-way sync to monitored folder**: Only after upload, not after download
2. **Requires client folder match**: Must find matching client folder by name
3. **May fail silently**: If client folder not found, returns False but doesn't log clearly

## Example Scenario

1. **File updated on server** by another user
2. **sync_from_server()** downloads it to virtual drive ✅
3. **Monitored folder** is NOT updated ❌
4. User opens file from monitored folder → sees old version

## Potential Solution

To update monitored folder after download, we could:
1. Add `_copy_to_monitored_folder()` call in `sync_from_server()`
2. After each successful download, copy to monitored folder
3. This would keep monitored folder in sync with virtual drive

## Current Workaround

Users should:
- Work directly with **virtual drive** files (`C:\LAWFIRM\clients\...`)
- Use monitored folder only for **initial uploads**
- Virtual drive is the **source of truth** for synced files

## Summary

- ✅ Monitored folder **IS updated** after upload to server
- ❌ Monitored folder **IS NOT updated** after download from server
- Virtual drive is always kept in sync
- Monitored folder may become out of sync if files are updated on server





