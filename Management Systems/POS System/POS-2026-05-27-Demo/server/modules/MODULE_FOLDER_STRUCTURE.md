# Module Folder Structure Documentation

## Overview
This document explains the folder structure of the POS module system and which files/folders are safe to delete.

## Folder Structure

```
server/modules/
├── installed/              # ✅ ACTIVE - Installed modules (DO NOT DELETE)
│   └── [module-name]/      # Server-side module files loaded at runtime
├── temp/                  # ✅ TEMPORARY - Used during installation (auto-cleaned)
├── config.json            # ✅ ACTIVE - Module registry configuration
├── moduleManager.js       # ✅ ACTIVE - Core module management code
├── moduleRoutes.js        # ✅ ACTIVE - API routes for modules
├── *.zip                  # ✅ ARCHIVE - Module ZIP files (safe to keep)
├── [module-name]/         # ❌ RESIDUAL - Source folders (should be removed)
└── sample-module/         # ⚠️  TEMPLATE - Sample module (optional, can delete)
```

## Folder Descriptions

### ✅ Active Folders (DO NOT DELETE)

#### `installed/`
- **Purpose**: Contains installed modules that are loaded by the server
- **Contents**: Server-side module files (index.js, package.json, etc.)
- **Used by**: ModuleManager loads modules from here using `require()`
- **Status**: CRITICAL - Removing this will break installed modules

#### `temp/`
- **Purpose**: Temporary extraction folder during ZIP installation
- **Contents**: Extracted ZIP files (temporary)
- **Used by**: Installation process
- **Status**: Auto-cleaned after installation, safe to delete if empty

#### `config.json`
- **Purpose**: Module registry - tracks installed/enabled modules
- **Contents**: JSON configuration with module metadata
- **Used by**: ModuleManager to track module state
- **Status**: CRITICAL - Removing this will lose module configuration

### ✅ Archive Files (SAFE TO KEEP)

#### `*.zip` files
- **Purpose**: Module distribution packages
- **Contents**: Complete module package (server + frontend files)
- **Used by**: Installation process extracts from these
- **Status**: SAFE - These are the source packages, can be kept for reinstallation

### ❌ Residual Folders (SHOULD BE REMOVED)

#### `[module-name]/` (root-level folders like `pos-advanced-reporting/`, `pos-clock-in-out/`, etc.)
- **Purpose**: **RESIDUAL** - Leftover source folders from manual installation or development
- **Contents**: Module source files including frontend components
- **Security Risk**: These folders can be used to recreate modules without the ZIP file
- **Status**: **SHOULD BE DELETED** - These are not used by the system after installation

**Why they exist:**
- Created during manual installation (copying folders instead of using ZIP)
- Leftover from development/testing
- Not cleaned up by old uninstall process

**Why they're dangerous:**
- Can be exploited to recreate modules without the original ZIP
- Take up unnecessary disk space
- Can cause confusion about which files are actually in use

### ⚠️ Optional Folders

#### `sample-module/`
- **Purpose**: Template/example module for developers
- **Status**: Optional - Can be deleted if not needed for development

## Installation Process

When a module is installed from a ZIP file:

1. **Extract**: ZIP is extracted to `temp/extracted_XXX/`
2. **Copy to installed/**: Module files copied to `installed/[module-name]/`
3. **Copy frontend**: Frontend components copied to `client/src/components/modules/[module-name]/`
4. **Register**: Module registered in `config.json`
5. **Cleanup**: Temp folder is deleted
6. **Result**: Only `installed/` and `client/` folders contain module files

## Uninstallation Process

When a module is uninstalled:

1. **Remove from installed/**: Deletes `installed/[module-name]/`
2. **Remove frontend**: Deletes `client/src/components/modules/[module-name]/`
3. **Remove residual**: Deletes root-level `[module-name]/` folder if it exists
4. **Unregister**: Removes entry from `config.json`
5. **Result**: All module files are completely removed

## Security Considerations

### ⚠️ Root-Level Module Folders Are a Security Risk

Root-level module folders (e.g., `pos-advanced-reporting/`) should **NOT** exist after installation because:

1. **Source Code Exposure**: They contain the complete module source code
2. **Recreation Risk**: Someone could recreate the module ZIP from these folders
3. **Version Confusion**: They may contain outdated or modified code
4. **Disk Space**: Unnecessary duplication of files

### ✅ Best Practices

1. **Always use ZIP files** for module distribution
2. **Delete root-level folders** after installation
3. **Keep only ZIP files** as the source of truth
4. **Use uninstall function** instead of manual deletion

## Cleanup Script

To clean up residual root-level module folders:

```javascript
// Run this in Node.js from server/modules directory
const fs = require('fs');
const path = require('path');

const modulesDir = __dirname;
const entries = fs.readdirSync(modulesDir, { withFileTypes: true });

for (const entry of entries) {
  if (entry.isDirectory()) {
    const dirPath = path.join(modulesDir, entry.name);
    // Skip system folders
    if (['installed', 'temp', 'archives', 'node_modules'].includes(entry.name)) {
      continue;
    }
    // Skip if it's a ZIP file
    if (entry.name.endsWith('.zip')) {
      continue;
    }
    // Delete residual module folders
    console.log(`Deleting residual folder: ${entry.name}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}
```

## File Locations Summary

| Component | Location | Purpose | Safe to Delete? |
|-----------|----------|---------|-----------------|
| Server Module Code | `installed/[module]/` | Runtime module loading | ❌ NO |
| Frontend Components | `client/src/components/modules/[module]/` | React components | ❌ NO |
| Module ZIP | `modules/*.zip` | Distribution package | ✅ YES (but keep for reinstall) |
| Residual Source | `modules/[module]/` | Leftover source files | ✅ YES (should delete) |
| Config | `modules/config.json` | Module registry | ❌ NO |
| Temp Files | `modules/temp/` | Installation temp | ✅ YES (auto-cleaned) |

## Troubleshooting

### "Cannot delete installed folder"
- **Cause**: Server is running and has modules loaded
- **Solution**: Stop the server first, then delete

### "Module files still exist after uninstall"
- **Cause**: Old uninstall process didn't clean up all files
- **Solution**: Use the updated uninstall function which removes:
  - `installed/[module]/`
  - `client/src/components/modules/[module]/`
  - `modules/[module]/` (root-level residual)

### "Frontend components not loading"
- **Cause**: Frontend components not copied during installation
- **Solution**: Reinstall the module - new install process copies frontend automatically

## Migration Notes

If you have existing root-level module folders:

1. **Backup**: Make sure you have the original ZIP files
2. **Uninstall**: Use the module uninstall function (will clean up automatically)
3. **Reinstall**: Install from ZIP if needed
4. **Manual Cleanup**: If folders still exist, delete them manually (server must be stopped)

---

**Last Updated**: 2025-01-27
**Version**: 2.0 (with automatic cleanup)

