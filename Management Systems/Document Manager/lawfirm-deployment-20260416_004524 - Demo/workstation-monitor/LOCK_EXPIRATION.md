# File Lock Automatic Expiration

## When Locks Automatically Expire

Locks automatically expire based on **time**, and are cleaned up **on-demand** when lock operations occur.

## Expiration Conditions

### 1. **Time-Based Expiration** ⏰

**Default Duration**: **5 minutes** (300,000 milliseconds)

**Configuration**:
- Default: 30 minutes
- Can be configured via environment variable: `FILE_LOCK_DURATION` (in seconds)
- Can be overridden when acquiring lock (custom duration parameter)

**How it works**:
- When a lock is acquired, an `expiresAt` timestamp is set
- `expiresAt = current time + lock duration`
- After this time, the lock is considered expired

### 2. **Automatic Cleanup** 🧹

Expired locks are **automatically cleaned up** when any of these operations occur:

1. **`acquireLock()`** - Before checking/acquiring a new lock
2. **`checkLock()`** - When checking if a document is locked
3. **`getLockStatus()`** - When getting lock status information
4. **`getLocksByOwner()`** - When getting all locks for a user/workstation

**Cleanup Process**:
```typescript
cleanupExpiredLocks() {
  // Deletes all locks where expiresAt < current time
  DELETE FROM file_locks WHERE expiresAt < NOW()
}
```

## Important Notes

### ⚠️ Cleanup is On-Demand, Not Periodic

- **No background timer**: There's no periodic job that runs to clean up expired locks
- **Cleanup happens on access**: Expired locks are removed when someone tries to:
  - Acquire a lock
  - Check lock status
  - Get lock information

### What This Means

1. **Expired locks are removed immediately** when any lock operation occurs
2. **If no one accesses the lock**, it remains in the database (but is effectively expired)
3. **Next lock operation** will clean it up automatically

## Example Scenarios

### Scenario 1: Normal Expiration
```
10:00 AM - User acquires lock (expires at 10:05 AM)
10:02 AM - User is still editing
10:05 AM - Lock expires (expiresAt < current time)
10:06 AM - Another user tries to acquire lock
         → cleanupExpiredLocks() runs
         → Expired lock is deleted
         → New lock can be acquired ✅
```

### Scenario 2: No Access After Expiration
```
10:00 AM - User acquires lock (expires at 10:05 AM)
10:02 AM - User closes application (doesn't release lock)
10:05 AM - Lock expires
10:10 AM - Lock still in database (no one accessed it)
10:15 AM - Another user tries to acquire lock
         → cleanupExpiredLocks() runs
         → Expired lock is deleted
         → New lock can be acquired ✅
```

### Scenario 3: Lock Extension
```
10:00 AM - User acquires lock (expires at 10:05 AM)
10:04 AM - User extends lock (new expiresAt = 10:09 AM)
10:05 AM - Original expiration time passes, but lock is still valid
10:09 AM - Lock expires (new expiration time)
```

## Configuration

### Default Duration
- **5 minutes** (300,000 milliseconds)

### Custom Duration via Environment Variable
In `server/.env`:
```env
FILE_LOCK_DURATION=300  # 5 minutes in seconds (default)
```

### Custom Duration per Lock
When acquiring a lock, you can specify a custom duration:
```typescript
acquireLock(documentId, userId, 'user', customDuration)
```

## Lock Extension

Locks can be extended before they expire:
- Call `extendLock()` to add more time
- New expiration = current time + lock duration
- Only the lock owner can extend their lock

## Summary

**Locks automatically expire when:**
1. ⏰ **Time expires**: `expiresAt < current time`
2. 🧹 **Cleanup runs**: On any lock operation (acquire, check, get status)

**Default expiration**: 5 minutes

**Cleanup**: On-demand (not periodic), happens automatically when lock operations occur

**Result**: Expired locks don't block new locks - they're cleaned up before any lock operation proceeds.

