# Module Database Access Documentation

## Current Status: ⚠️ LOCAL DATABASE ONLY

**Important**: Modules currently **ONLY use the local SQLite database**, even when remote database mode is selected in the POS system.

## How Modules Access the Database

### Current Implementation

1. **Module Initialization**:
   ```javascript
   // In server/index.js (line 4289)
   const moduleManager = new ModuleManager(db);
   ```
   - `db` is a direct SQLite connection: `new sqlite3.Database('./pos_database.db')`
   - This is passed to modules during initialization

2. **Module Database Access**:
   ```javascript
   // In module index.js
   initialize(moduleManager, db = null) {
     this.db = db || moduleManager.db;  // Direct SQLite connection
   }
   
   // Modules use direct SQLite methods
   this.db.all('SELECT * FROM sales', (err, rows) => {
     // Handle results
   });
   ```

3. **Main App Database Access**:
   ```javascript
   // In server/index.js
   const dbConnector = getDatabaseConnector();  // Handles local/remote
   
   // Main app uses dbConnector
   const rows = await dbConnector.query('SELECT * FROM sales');
   ```

### The Problem

- ✅ **Main App**: Uses `dbConnector` → Works with both local and remote databases
- ❌ **Modules**: Use direct `db` connection → **ONLY works with local database**

When remote database mode is selected:
- Main app routes use `dbConnector` → Queries go to remote database ✅
- Module routes use `this.db` → Queries go to local database ❌

This creates a **data inconsistency** where:
- Main app reads/writes to remote database
- Modules read/write to local database
- Data is out of sync between main app and modules

## Database Access Methods

### Current Module Pattern

```javascript
class YourModule {
  getDatabase() {
    // Returns direct SQLite connection
    return this.db || this.moduleManager.db;
  }

  yourRouteHandler(req, res) {
    const db = this.getDatabase();
    
    // Direct SQLite methods (local only)
    db.all('SELECT * FROM table', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, data: rows });
    });
  }
}
```

### Main App Pattern (Remote-Compatible)

```javascript
// Uses dbConnector which handles local/remote
const rows = await dbConnector.query('SELECT * FROM table');
const row = await dbConnector.get('SELECT * FROM table WHERE id = ?', [id]);
await dbConnector.run('INSERT INTO table ...', [values]);
```

## Impact

### What Works
- ✅ Modules work correctly in **local database mode**
- ✅ Main app works in both local and remote modes
- ✅ Module installation/uninstallation
- ✅ Module routes and frontend components

### What Doesn't Work
- ❌ Modules **cannot access remote database**
- ❌ Data inconsistency when remote mode is active
- ❌ Module queries may return stale/wrong data
- ❌ Module writes go to wrong database

## Example Scenario

**Scenario**: POS system is in remote database mode

1. **User creates a sale** (via main app):
   - Main app uses `dbConnector` → Sale saved to **remote database** ✅

2. **Module generates report**:
   - Module uses `this.db` → Queries **local database** ❌
   - Report shows old/incorrect data

3. **Result**: 
   - Remote database has new sale
   - Local database doesn't have new sale
   - Module report is incorrect

## Solution: Update Modules to Use dbConnector

### Required Changes

1. **Update ModuleManager** to receive `dbConnector` instead of `db`:
   ```javascript
   // In server/index.js
   const moduleManager = new ModuleManager(dbConnector);
   ```

2. **Update Module Initialization**:
   ```javascript
   // In module index.js
   initialize(moduleManager, dbConnector = null) {
     this.dbConnector = dbConnector || moduleManager.dbConnector;
   }
   ```

3. **Update Module Queries** to use dbConnector:
   ```javascript
   // OLD (direct SQLite - local only)
   this.db.all('SELECT * FROM sales', (err, rows) => {
     // Handle results
   });
   
   // NEW (dbConnector - local/remote compatible)
   async yourRouteHandler(req, res) {
     try {
       const rows = await this.dbConnector.query('SELECT * FROM sales');
       res.json({ success: true, data: rows });
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   }
   ```

### Migration Guide for Existing Modules

#### Step 1: Update getDatabase() Method

```javascript
// OLD
getDatabase() {
  return this.db || this.moduleManager.db;
}

// NEW
getDatabaseConnector() {
  return this.dbConnector || this.moduleManager.dbConnector;
}
```

#### Step 2: Convert Callback-Based Queries to Async/Await

```javascript
// OLD - Callback style
getSalesReport(req, res) {
  const db = this.getDatabase();
  db.all('SELECT * FROM sales', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, data: rows });
  });
}

// NEW - Async/await style
async getSalesReport(req, res) {
  try {
    const rows = await this.dbConnector.query('SELECT * FROM sales');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### Step 3: Update Route Handlers

```javascript
// OLD
getRoutes() {
  return [
    {
      method: 'GET',
      path: '/module/endpoint',
      handler: this.getData.bind(this)  // Callback-based
    }
  ];
}

// NEW
getRoutes() {
  return [
    {
      method: 'GET',
      path: '/module/endpoint',
      handler: async (req, res) => {  // Async handler
        try {
          const data = await this.dbConnector.query('SELECT * FROM table');
          res.json({ success: true, data });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    }
  ];
}
```

## dbConnector API Reference

### Query Methods

```javascript
// Get multiple rows
const rows = await dbConnector.query('SELECT * FROM table WHERE condition = ?', [value]);

// Get single row
const row = await dbConnector.get('SELECT * FROM table WHERE id = ?', [id]);

// Execute INSERT/UPDATE/DELETE
const result = await dbConnector.run('INSERT INTO table (col1, col2) VALUES (?, ?)', [val1, val2]);

// Transactions
await dbConnector.beginTransaction();
try {
  await dbConnector.run('INSERT INTO ...', [values]);
  await dbConnector.run('UPDATE ...', [values]);
  await dbConnector.commit();
} catch (error) {
  await dbConnector.rollback();
  throw error;
}
```

### Differences from Direct SQLite

| SQLite Direct | dbConnector |
|---------------|-------------|
| `db.all(sql, callback)` | `await dbConnector.query(sql, params)` |
| `db.get(sql, callback)` | `await dbConnector.get(sql, params)` |
| `db.run(sql, callback)` | `await dbConnector.run(sql, params)` |
| Callback-based | Promise-based (async/await) |
| Local only | Local + Remote |

## Recommendations

### For New Modules

1. ✅ Always use `dbConnector` (not direct `db`)
2. ✅ Use async/await pattern
3. ✅ Handle errors with try/catch
4. ✅ Test with both local and remote database modes

### For Existing Modules

1. ⚠️ **Current modules only work with local database**
2. 🔄 **Update required** to support remote database
3. 📝 **Migration needed** to convert callback-based queries to async/await
4. 🧪 **Testing required** after migration

## Current Module Status

| Module | Database Access | Remote Support |
|--------|----------------|----------------|
| pos-advanced-reporting | Direct SQLite (`this.db`) | ❌ No |
| pos-clock-in-out | Direct SQLite (`this.db`) | ❌ No |
| pos-user-management | Direct SQLite (`this.db`) | ❌ No |
| pos-loyalty-module | Direct SQLite (`this.db`) | ❌ No |

## Summary

- **Current State**: Modules use direct SQLite connection → **Local database only**
- **Required**: Modules should use `dbConnector` → **Local + Remote support**
- **Impact**: Data inconsistency when remote mode is active
- **Action**: Update ModuleManager and modules to use `dbConnector`

---

**Last Updated**: 2025-01-27  
**Status**: ⚠️ Modules need update to support remote database

