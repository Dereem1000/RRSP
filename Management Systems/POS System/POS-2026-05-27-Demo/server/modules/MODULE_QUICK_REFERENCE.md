# Module Development Quick Reference

## Essential Structure

```
module-name/
├── package.json          # REQUIRED
├── index.js              # REQUIRED
├── frontend/             # OPTIONAL
│   └── Component.js
└── README.md             # RECOMMENDED
```

## package.json Minimum

```json
{
  "name": "pos-your-module",
  "version": "1.0.0",
  "description": "Module description",
  "main": "index.js",
  "author": "Your Name",
  "license": "MIT"
}
```

## index.js Minimum

```javascript
class YourModule {
  constructor() {
    this.name = 'pos-your-module';
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
        path: '/your-module/endpoint',
        handler: this.handler.bind(this)
      }
    ];
  }

  getFrontendComponents() {
    return {
      Component: './frontend/Component'
    };
  }
}

module.exports = new YourModule();
```

## ZIP Creation

1. Create folder: `your-module-name/`
2. Add files: `package.json`, `index.js`, `frontend/` (if needed)
3. ZIP the folder (not just files)
4. Result: `your-module-name.zip` containing `your-module-name/` folder

## Installation Flow

1. Upload ZIP → Extract to temp
2. Copy to `installed/[module-name]/`
3. Copy `frontend/` to `client/src/components/modules/[module-name]/`
4. Register in `config.json`
5. Clean temp files

## Uninstallation Flow

1. Remove `installed/[module-name]/`
2. Remove `client/src/components/modules/[module-name]/`
3. Remove root-level `modules/[module-name]/` (if exists)
4. Unregister from `config.json`

## Settings Schema

```json
"settings": {
  "settingName": {
    "type": "boolean" | "number" | "string" | "select",
    "default": value,
    "description": "User-facing description",
    "options": ["option1", "option2"]  // For "select" type
  }
}
```

## Route Structure

```javascript
{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: '/your-module/endpoint',  // Will be prefixed with /api
  handler: this.handler.bind(this),
  middleware: [this.auth.bind(this)]  // Optional
}
```

## Frontend Component

```javascript
// frontend/Component.js
import React from 'react';

const Component = () => {
  return <div>Your Component</div>;
};

export default Component;
```

## Key Points

- ✅ Module name must match ZIP folder name
- ✅ `frontend/` folder automatically copied to client
- ✅ All files cleaned up on uninstall
- ✅ Routes automatically prefixed with `/api`
- ✅ Settings appear in module settings modal

---

**See MODULE_DEVELOPMENT_GUIDE.md for complete documentation**

