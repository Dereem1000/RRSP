# Backup & recovery (v2)

Computer Dynamics v2 stores ZIP backups under `data/backups/` and records metadata in the legacy `backups` table.

## Package

`@cd-v2/backup` — create, verify, restore, retention, auto-schedule, and file extract for security auto-repair.

## Backup types

| Type | Contents |
|------|----------|
| `full` | SQLite DB, uploads, critical monorepo paths (security, database, web auth) |
| `database` | `computer_dynamics.db` only |
| `files` | `data/uploads/` only |
| `license` | `license_activation_system_new/instance/license_system.db` only |
| `manual` | Same as full |

## Restore types

| Type | Action |
|------|--------|
| `database` | Replace SQLite file (pre-restore copy unless overwrite) |
| `files` | Replace `data/uploads/` |
| `license` | Replace license SQLite only (S-CLS1 + auth code) |
| `full` | MSP database + license DB (if present) + files + `app/*` paths (requires S-CLS1 + auth code) |

## Settings UI

**Settings → Backup**

- Create / list / verify / download / delete backups
- **System recovery** — select backup or upload ZIP (replaces v1 `/api/emergency/recovery`)

## Auto-backup

Configured via `autoBackupConfig` in `system_configs`. The security worker calls `maybeRunAutoBackup()` each monitor cycle when `nextRun` has passed.

## Auto-repair

When `security_repair_enabled` is true, file integrity failures trigger restore from the latest completed backup (`app/<path>` entries). Toggle in **Settings → Security**.

## API (admin)

| Method | Path |
|--------|------|
| GET | `/api/backup/list` |
| POST | `/api/backup/create` |
| GET | `/api/backup/status` |
| GET/POST | `/api/backup/auto-settings` |
| GET | `/api/backup/progress/[id]` |
| GET | `/api/backup/[id]/download` |
| POST | `/api/backup/[id]/verify` |
| POST | `/api/backup/[id]/restore` |
| POST | `/api/backup/upload-restore` |
| DELETE | `/api/backup/[id]` |
