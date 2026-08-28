# MultiServer Update Package

| Field | Value |
|--------|--------|
| **Version** | {{VERSION}} |
| **Build date** | {{BUILD_DATE}} |
| **Build ID** | {{BUILD_ID}} |
| **Package type** | Update (existing installs) |

## What this package does

Updates an **existing** MultiServer installation to **v{{VERSION}}**. Application code is replaced; **instance-specific files on the target machine are never overwritten**.

See **`update-preserves.json`** in this folder for the full exclusion list.

### Never overwritten (preserved on target)

{{PRESERVE_LIST}}

## Quick apply (Windows)

1. **Stop** MultiServer and any running demos.
2. Extract this folder anywhere.
3. Double-click **`apply-update.bat`** or run:

   ```bat
   apply-update.bat "E:\MultiServer"
   ```

4. Start MultiServer again with `launch.bat`.
5. If you use Caddy, regenerate from local config.

## Mini Update Library

Build also emits `deploy/YYYY-MM-DD-vX.Y.Z/` for Mini Deploy Source registration (project key **`multiserver`**).
