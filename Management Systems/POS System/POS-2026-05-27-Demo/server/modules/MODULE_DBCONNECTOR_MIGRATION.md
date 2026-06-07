# Module dbConnector Migration Guide

## Status

✅ **ModuleManager Updated** - Now accepts and passes dbConnector  
✅ **Server Updated** - Passes dbConnector to ModuleManager  
🔄 **Modules In Progress** - pos-advanced-reporting partially updated  
⏳ **Remaining Modules** - pos-user-management, pos-loyalty-module need updates

## Conversion Pattern

### Before (Callback-based, Local Only)

```javascript
getSalesReport(req, res) {
  try {
    const db = this.getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    db.all('SELECT * FROM sales', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, data: rows });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### After (Async/Await, Local + Remote)

```javascript
async getSalesReport(req, res) {
  try {
    const dbConnector = this.getDatabaseConnector();
    if (!dbConnector) {
      return res.status(500).json({ error: 'Database not configured' });
    }
    
    const rows = await dbConnector.query('SELECT * FROM sales');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error in getSalesReport:', error);
    res.status(500).json({ error: error.message });
  }
}
```

## Key Changes

1. **Method Signature**: Add `async` keyword
2. **Database Access**: `getDatabase()` → `getDatabaseConnector()`
3. **Query Methods**:
   - `db.all(sql, params, callback)` → `await dbConnector.query(sql, params)`
   - `db.get(sql, params, callback)` → `await dbConnector.get(sql, params)`
   - `db.run(sql, params, callback)` → `await dbConnector.run(sql, params)`
4. **Error Handling**: Use try/catch instead of callback error handling

## Remaining Work

### pos-advanced-reporting
- ✅ Initialization updated
- ✅ getDatabaseConnector() added
- ✅ getAdvancedSalesReport() converted
- ⏳ ~20 more methods need conversion

### pos-user-management
- ⏳ All methods need conversion (~15 methods)

### pos-loyalty-module
- ⏳ All methods need conversion (~10 methods)

## Automated Conversion Script

Due to the large number of methods, consider creating a script to:
1. Find all `db.all()`, `db.get()`, `db.run()` calls
2. Convert to async/await pattern
3. Update method signatures to `async`

Or manually convert each method following the pattern above.

---

**Note**: This is a breaking change. All modules must be updated to work with remote database.

