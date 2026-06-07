# POS Module Development Guide

## Overview

This guide explains how to build modules for the POS System based on the current module structure and the latest installation/uninstallation improvements.

## Table of Contents

1. [Module Structure](#module-structure)
2. [Required Files](#required-files)
3. [Package.json Configuration](#packagejson-configuration)
4. [Server-Side Module (index.js)](#server-side-module-indexjs)
5. [Frontend Components](#frontend-components)
6. [Module Installation Process](#module-installation-process)
7. [Creating Module ZIP Files](#creating-module-zip-files)
8. [Best Practices](#best-practices)
9. [Module Examples](#module-examples)

---

## Module Structure

A POS module must follow this directory structure:

```
your-module-name/
├── package.json          # REQUIRED - Module metadata and configuration
├── index.js              # REQUIRED - Server-side module entry point
├── README.md             # RECOMMENDED - Module documentation
├── frontend/              # OPTIONAL - Frontend React components
│   ├── YourComponent.js  # React component files
│   └── index.js          # Optional: Component exports
└── [other files]         # Any additional files your module needs
```

### Directory Structure Details

- **Root Level**: Contains `package.json`, `index.js`, and optional documentation
- **frontend/**: Contains React components that will be copied to `client/src/components/modules/[module-name]/` during installation
- **Other folders**: Any additional server-side code, utilities, etc.

---

## Required Files

### 1. package.json (REQUIRED)

The `package.json` file defines your module's metadata, dependencies, permissions, and settings.

#### Minimum Required Fields

```json
{
  "name": "your-module-name",
  "version": "1.0.0",
  "description": "Description of your module",
  "main": "index.js",
  "author": "Your Name",
  "license": "MIT"
}
```

#### Complete package.json Example

```json
{
  "name": "pos-advanced-reporting",
  "version": "1.1.0",
  "description": "Advanced reporting module with enhanced filtering, analytics, and export capabilities",
  "main": "index.js",
  "author": "POS System",
  "license": "MIT",
  "dependencies": {},
  "posDependencies": {
    "core": ">=1.0.0"
  },
  "permissions": [
    "sales:read",
    "products:read",
    "users:read",
    "reports:read",
    "reports:write"
  ],
  "settings": {
    "enableFeature": {
      "type": "boolean",
      "default": true,
      "description": "Enable this feature"
    },
    "maxItems": {
      "type": "number",
      "default": 100,
      "description": "Maximum number of items"
    },
    "defaultView": {
      "type": "select",
      "default": "list",
      "options": ["list", "grid", "table"],
      "description": "Default view mode"
    }
  }
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ Yes | Module name (must be unique, use `pos-` prefix) |
| `version` | string | ✅ Yes | Semantic version (e.g., "1.0.0") |
| `description` | string | ✅ Yes | Brief description of the module |
| `main` | string | ✅ Yes | Entry point file (usually "index.js") |
| `author` | string | ✅ Yes | Module author/developer |
| `license` | string | ✅ Yes | License type (e.g., "MIT") |
| `dependencies` | object | ❌ No | NPM dependencies (currently not auto-installed) |
| `posDependencies` | object | ❌ No | POS system version requirements |
| `permissions` | array | ❌ No | Required permissions for the module |
| `settings` | object | ❌ No | Module configuration settings schema |

#### Settings Schema

Settings define configurable options for your module. Each setting supports:

- **type**: `"boolean"`, `"number"`, `"string"`, `"select"`
- **default**: Default value
- **description**: User-facing description
- **options**: (for `"select"` type) Array of available options

---

### 2. index.js (REQUIRED)

The `index.js` file is the server-side entry point for your module. It must export a class or object with specific methods.

#### Minimum Module Structure

```javascript
class YourModuleName {
  constructor() {
    this.name = 'your-module-name';
    this.version = '1.0.0';
    this.db = null;
  }

  // REQUIRED: Initialize the module
  initialize(moduleManager, db = null) {
    this.moduleManager = moduleManager;
    this.db = db || (moduleManager && moduleManager.db);
    
    console.log(`${this.name} module initialized`);
    
    // Register API routes
    this.routes = this.getRoutes();
  }

  // OPTIONAL: Get API routes
  getRoutes() {
    return [
      {
        method: 'GET',
        path: '/your-module/endpoint',
        handler: this.yourHandler.bind(this),
        middleware: [this.requireAuth.bind(this)] // Optional
      }
    ];
  }

  // OPTIONAL: Get frontend components
  getFrontendComponents() {
    return {
      ComponentName: './frontend/ComponentName',
      metadata: {
        ComponentName: {
          name: 'ComponentName',
          description: 'Component description',
          usage: 'Where it\'s used'
        }
      }
    };
  }

  // Helper: Require authentication
  requireAuth(req, res, next) {
    // Your auth logic here
    next();
  }
}

module.exports = new YourModuleName();
```

#### Required Methods

##### `initialize(moduleManager, db)`
- **Purpose**: Called when the module is loaded
- **Parameters**:
  - `moduleManager`: Reference to the ModuleManager instance
  - `db`: Database connection (may be null initially)
- **Must**: Set `this.moduleManager` and `this.db`

##### `getRoutes()` (Optional but recommended)
- **Purpose**: Define API endpoints for your module
- **Returns**: Array of route objects
- **Route Object Structure**:
  ```javascript
  {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: '/api/your-module/endpoint',
    handler: this.handlerFunction.bind(this),
    middleware: [this.middleware1.bind(this)] // Optional
  }
  ```

##### `getFrontendComponents()` (Optional)
- **Purpose**: Declare frontend React components
- **Returns**: Object mapping component names to file paths
- **Note**: Paths are relative to the module root
- **Example**:
  ```javascript
  {
    MyComponent: './frontend/MyComponent',
    AnotherComponent: './frontend/AnotherComponent'
  }
  ```

#### Database Access

Modules receive database access through the `initialize()` method using `dbConnector`, which supports both local SQLite and remote HTTP API databases:

```javascript
class YourModule {
  constructor() {
    this.name = 'your-module-name';
    this.version = '1.0.0';
    this.dbConnector = null; // Database connector (supports local/remote)
    this.db = null; // Legacy support (deprecated)
  }

  initialize(moduleManager, dbConnector = null) {
    this.moduleManager = moduleManager;
    
    // Use dbConnector (supports local/remote database)
    if (dbConnector) {
      this.dbConnector = dbConnector;
    } else if (moduleManager && moduleManager.dbConnector) {
      this.dbConnector = moduleManager.dbConnector;
    }
    
    console.log(`Module initialized${this.dbConnector ? ' with database connector (local/remote support)' : ' (database connection pending)'}`);
    
    // Register routes
    this.routes = this.getRoutes();
  }

  // Get database connector instance (supports local/remote)
  getDatabaseConnector() {
    if (this.dbConnector) {
      return this.dbConnector;
    }
    
    if (this.moduleManager && this.moduleManager.dbConnector) {
      return this.moduleManager.dbConnector;
    }
    
    return null;
  }

  // Example route handler using dbConnector
  async getData(req, res) {
    try {
      const dbConnector = this.getDatabaseConnector();
      if (!dbConnector) {
        return res.status(500).json({
          success: false,
          error: 'Database access not configured'
        });
      }

      // Use async/await with dbConnector
      const rows = await dbConnector.query('SELECT * FROM table WHERE id = ?', [req.params.id]);
      
      res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      console.error('Error in getData:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

##### Database Connector Methods

The `dbConnector` provides these async methods:

- **`query(sql, params)`**: Execute SELECT queries (returns array of rows)
  ```javascript
  const rows = await dbConnector.query('SELECT * FROM sales WHERE date >= ?', [startDate]);
  ```

- **`get(sql, params)`**: Execute SELECT query for single row (returns single row or null)
  ```javascript
  const user = await dbConnector.get('SELECT * FROM users WHERE id = ?', [userId]);
  ```

- **`run(sql, params)`**: Execute INSERT, UPDATE, DELETE (returns result object with `lastID` and `changes`)
  ```javascript
  const result = await dbConnector.run('INSERT INTO sales (amount) VALUES (?)', [amount]);
  console.log('Inserted ID:', result.lastID);
  ```

##### Important Notes

- ✅ **Always use `async/await`** with dbConnector methods
- ✅ **Always check if dbConnector exists** before using it
- ✅ **Use `getDatabaseConnector()`** helper method to get the connector
- ❌ **Do NOT use direct SQLite `db` connections** - they only work with local database
- ❌ **Do NOT use callback-style database calls** - use async/await instead

##### Migration from Direct SQLite

If you have existing code using direct SQLite:

**Old (callback-based, local only):**
```javascript
const db = this.getDatabase();
db.all('SELECT * FROM table', (err, rows) => {
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  res.json({ data: rows });
});
```

**New (async/await, local/remote support):**
```javascript
const dbConnector = this.getDatabaseConnector();
if (!dbConnector) {
  return res.status(500).json({ error: 'Database not configured' });
}
const rows = await dbConnector.query('SELECT * FROM table', []);
res.json({ data: rows });
```

---

## Frontend Components

### Structure

Frontend components must be placed in a `frontend/` folder at the module root:

```
your-module-name/
└── frontend/
    ├── YourComponent.js
    ├── AnotherComponent.js
    └── index.js (optional)
```

### Installation Process

When a module is installed:
1. The `frontend/` folder is automatically copied to `client/src/components/modules/[module-name]/`
2. Components are available for dynamic import in the React app
3. Components are removed during uninstallation

### Component Example

```javascript
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
// ⚠️ IMPORTANT: Import paths must be relative to the FINAL installed location
// Components are installed to: client/src/components/modules/[module-name]/
// So to import from client/src/utils/, use: '../../../utils/...'
import { formatCurrency } from '../../../utils/currency';

const Container = styled.div`
  padding: 20px;
`;

const YourComponent = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    // Fetch data from your module's API
    fetch('/api/your-module/endpoint')
      .then(res => res.json())
      .then(data => setData(data));
  }, []);

  return (
    <Container>
      <h2>Your Module Component</h2>
      {/* Your component UI */}
    </Container>
  );
};

export default YourComponent;
```

### ⚠️ Important: Import Paths in Frontend Components

**Critical**: When writing frontend components for modules, you must use import paths that are correct for the **final installed location**, not the module's source location.

**Final Location**: `client/src/components/modules/[module-name]/YourComponent.js`

**Common Import Paths**:
- To import from `client/src/utils/`: Use `../../../utils/...`
- To import from `client/src/components/`: Use `../../...`
- To import from `client/src/`: Use `../../../...`

**Example**:
```javascript
// ✅ CORRECT - Path relative to final installed location
import { formatCurrency } from '../../../utils/currency';
import { SomeComponent } from '../../SomeComponent';

// ❌ WRONG - Path relative to module source location
import { formatCurrency } from '../../utils/currency';
```

### Using Frontend Components

Frontend components are dynamically imported in the main app:

```javascript
// In App.js or other components
const module = await import('./components/modules/your-module-name/YourComponent');
const Component = module.default;
```

### getFrontendComponents() Mapping

The paths in `getFrontendComponents()` should match your `frontend/` folder structure:

```javascript
// In index.js
getFrontendComponents() {
  return {
    YourComponent: './frontend/YourComponent',  // Maps to frontend/YourComponent.js
    AnotherComponent: './frontend/AnotherComponent'
  };
}
```

---

## Module Installation Process

### What Happens During Installation

1. **ZIP Extraction**: Module ZIP is extracted to a temporary folder
2. **Validation**: System checks for `package.json` and validates structure
3. **Copy to installed/**: Module files copied to `server/modules/installed/[module-name]/`
4. **Copy Frontend**: `frontend/` folder copied to `client/src/components/modules/[module-name]/`
5. **Registration**: Module registered in `config.json`
6. **Cleanup**: Temporary files removed
7. **Loading**: Module loaded on next server restart or logout/login

### Installation Requirements

- ✅ Module must have `package.json` in root
- ✅ Module must have `index.js` (or file specified in `package.json.main`)
- ✅ Module name must be unique
- ✅ ZIP file must contain module folder (not just files)

### ZIP File Structure

Your ZIP file should contain the module folder:

```
your-module.zip
└── your-module-name/          # Module folder (required)
    ├── package.json
    ├── index.js
    ├── frontend/
    └── [other files]
```

**NOT** just the files directly in the ZIP root.

---

## Creating Module ZIP Files

### Step-by-Step Process

1. **Create Module Folder**
   ```
   your-module-name/
   ├── package.json
   ├── index.js
   ├── frontend/
   └── README.md
   ```

2. **Test Locally** (Optional)
   - Test your module code
   - Verify frontend components work

3. **Create ZIP File**
   - **Windows**: Right-click folder → Send to → Compressed (zipped) folder
   - **Mac/Linux**: `zip -r your-module-name.zip your-module-name/`
   - **Important**: ZIP should contain the module folder, not just files

4. **Verify ZIP Structure**
   - Extract the ZIP and verify the folder structure
   - Ensure `package.json` is in the module folder root

5. **Test Installation**
   - Upload ZIP through the module management interface
   - Verify installation succeeds
   - Check that files are in correct locations:
     - `server/modules/installed/[module-name]/`
     - `client/src/components/modules/[module-name]/`

### ZIP File Naming

- Use the module name: `your-module-name.zip`
- Must match the `name` field in `package.json`

---

## Module Uninstallation Process

### What Gets Removed

When a module is uninstalled, the system automatically removes:

1. ✅ `server/modules/installed/[module-name]/` - Server-side files
2. ✅ `client/src/components/modules/[module-name]/` - Frontend components
3. ✅ Root-level `server/modules/[module-name]/` - Any residual source folders
4. ✅ Module entry from `config.json` - Registry entry

### Clean Uninstallation

- All module files are completely removed
- No residual files remain
- System is ready for reinstallation if needed

---

## Best Practices

### 1. Module Naming

- Use `pos-` prefix: `pos-your-module-name`
- Use kebab-case: `pos-advanced-reporting` (not `posAdvancedReporting`)
- Keep names descriptive and unique

### 2. Version Management

- Use semantic versioning: `MAJOR.MINOR.PATCH`
- Update version in both `package.json` and `index.js` constructor
- Document changes in `README.md`

### 3. Error Handling

```javascript
// Always handle errors in route handlers
getRoutes() {
  return [
    {
      method: 'GET',
      path: '/your-module/data',
      handler: async (req, res) => {
        try {
          // Your logic
          res.json({ success: true, data: result });
        } catch (error) {
          console.error('Error:', error);
          res.status(500).json({ success: false, error: error.message });
        }
      }
    }
  ];
}
```

### 4. Database Queries

```javascript
// Use parameterized queries
this.db.all(
  'SELECT * FROM sales WHERE date >= ? AND date <= ?',
  [startDate, endDate],
  (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return;
    }
    // Handle rows
  }
);
```

### 5. Frontend Component Best Practices

- Use React hooks (`useState`, `useEffect`)
- Handle loading and error states
- Use styled-components for styling (matches POS system style)
- Make API calls to your module's endpoints

### 6. Settings Management

- Define all configurable options in `package.json` settings
- Use appropriate types (boolean, number, string, select)
- Provide clear descriptions
- Set sensible defaults

### 7. Documentation

- Include `README.md` with:
  - Module description
  - Installation instructions
  - Usage examples
  - API documentation
  - Settings explanation

---

## Module Examples

### Example 1: Simple Module (No Frontend)

```json
// package.json
{
  "name": "pos-simple-module",
  "version": "1.0.0",
  "description": "A simple module with no frontend",
  "main": "index.js",
  "author": "Developer",
  "license": "MIT"
}
```

```javascript
// index.js
class SimpleModule {
  constructor() {
    this.name = 'pos-simple-module';
    this.version = '1.0.0';
  }

  initialize(moduleManager, db) {
    this.moduleManager = moduleManager;
    this.db = db;
    this.routes = this.getRoutes();
    console.log('Simple module initialized');
  }

  getRoutes() {
    return [
      {
        method: 'GET',
        path: '/simple-module/hello',
        handler: (req, res) => {
          res.json({ message: 'Hello from simple module!' });
        }
      }
    ];
  }
}

module.exports = new SimpleModule();
```

### Example 2: Module with Frontend

```json
// package.json
{
  "name": "pos-frontend-module",
  "version": "1.0.0",
  "description": "Module with frontend components",
  "main": "index.js",
  "author": "Developer",
  "license": "MIT",
  "settings": {
    "enableFeature": {
      "type": "boolean",
      "default": true,
      "description": "Enable the main feature"
    }
  }
}
```

```javascript
// index.js
class FrontendModule {
  constructor() {
    this.name = 'pos-frontend-module';
    this.version = '1.0.0';
  }

  initialize(moduleManager, db) {
    this.moduleManager = moduleManager;
    this.db = db;
    this.routes = this.getRoutes();
  }

  getRoutes() {
    return [
      {
        method: 'GET',
        path: '/frontend-module/data',
        handler: this.getData.bind(this)
      }
    ];
  }

  getFrontendComponents() {
    return {
      MyComponent: './frontend/MyComponent'
    };
  }

  async getData(req, res) {
    try {
      // Get data from database
      const data = await this.queryDatabase();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  queryDatabase() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM table', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = new FrontendModule();
```

```javascript
// frontend/MyComponent.js
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  padding: 20px;
`;

const MyComponent = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/frontend-module/data')
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setData(result.data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <Container>Loading...</Container>;

  return (
    <Container>
      <h2>My Module Component</h2>
      {/* Render data */}
    </Container>
  );
};

export default MyComponent;
```

---

## Current Module Examples

Based on existing modules in the system:

### pos-advanced-reporting
- **Purpose**: Advanced sales and analytics reporting
- **Frontend**: `AdvancedReports.js` component
- **Routes**: Multiple reporting endpoints
- **Settings**: Analytics toggles, date ranges, export limits

### pos-clock-in-out
- **Purpose**: Employee time tracking
- **Frontend**: `ClockInOutPrompt.js`, `TimeSheets.js`, `ClockInOutSettings.js`
- **Routes**: Clock in/out endpoints, timesheet management
- **Settings**: Auto clock-in/out, prompt settings

### pos-user-management
- **Purpose**: Enhanced user management with PIN and lock screen
- **Frontend**: `PinManagement.js`, `LockScreen.js`
- **Routes**: User role management, PIN operations
- **Settings**: PIN requirements, lock screen settings

---

## Troubleshooting

### Module Not Installing

- ✅ Check ZIP contains module folder (not just files)
- ✅ Verify `package.json` exists in module root
- ✅ Ensure `index.js` exists (or matches `main` field)
- ✅ Check module name is unique

### Frontend Components Not Loading

- ✅ Verify `frontend/` folder exists in module
- ✅ Check `getFrontendComponents()` returns correct paths
- ✅ Ensure components are React components with default export
- ✅ Verify installation copied files to `client/src/components/modules/`

### Routes Not Working

- ✅ Check `getRoutes()` returns array of route objects
- ✅ Verify route paths start with `/` (will be prefixed with `/api`)
- ✅ Ensure handlers are bound: `this.handler.bind(this)`
- ✅ Check server console for route registration messages

### Settings Not Appearing

- ✅ Verify `settings` object in `package.json`
- ✅ Check setting types are valid: `boolean`, `number`, `string`, `select`
- ✅ Ensure `select` type has `options` array
- ✅ Settings appear in module settings modal after installation

---

## Summary Checklist

Before creating your module ZIP:

- [ ] Module folder structure is correct
- [ ] `package.json` has all required fields
- [ ] `index.js` exports module with `initialize()` method
- [ ] `getRoutes()` returns valid route array (if using routes)
- [ ] `getFrontendComponents()` returns component mapping (if using frontend)
- [ ] Frontend components in `frontend/` folder (if using frontend)
- [ ] `README.md` includes documentation
- [ ] ZIP file contains module folder (not just files)
- [ ] Module name is unique and follows naming convention
- [ ] Version numbers match in `package.json` and `index.js`

---

**Last Updated**: 2025-01-27  
**Based on**: POS System Module System v2.0  
**Module Manager Version**: 2.0 (with automatic frontend copying and cleanup)

