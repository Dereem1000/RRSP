# Backup & recovery (v2)

Computer Dynamics v2 stores ZIP backups under `data/backups/` and records metadata in the legacy `backups` table.

## Package

`@cd-v2/backup` — create, verify, restore, retention, auto-schedule, and file extract for security auto-repair.

## Backup types

| Type | Contents |
|------|----------|
| `standard` | MSP SQLite DB, license DB, uploads, ~64 security-critical source paths under `app/` |
| `system` | Everything in `standard`, plus full `data/` (except backups/temp), and v2 source under `repo/` (`apps/`, `packages/`, `scripts/`, `docs/`, `license_activation_system_new/`, root config) |
| `database` | Active MSP SQLite file only |
| `files` | `data/uploads/` only |
| `license` | `license_activation_system_new/instance/license_system.db` only |
| `manual` / `auto` | Same as `standard` |
| `full` | **Legacy alias** for `standard` (existing backups keep this label in the DB) |

`system` backups exclude `node_modules`, `.git`, `.next`, `dist`, `data/backups`, `data/restore-temp`, and `Management Systems/`.

## Restore types

| Type | Action |
|------|--------|
| `database` | Replace active MSP SQLite file (pre-restore copy unless overwrite) |
| `files` | Replace `data/uploads/` |
| `license` | Replace license SQLite only (S-CLS1 + auth code) |
| `standard` | MSP DB + license DB (if present) + uploads + `app/*` paths (S-CLS1 + auth code) |
| `system` | Standard restore + `data/*` + `repo/*` tree (S-CLS1 + auth code) |
| `full` | Legacy alias for `standard` |

## Settings UI

**Settings → Backup**

- **Standard backup** — daily default; data + security paths
- **Full system backup** — disaster recovery; full v2 source + runtime data
- List / verify / download / delete backups
- **System recovery** — select backup or upload ZIP

## Auto-backup

Configured via `autoBackupConfig` in `system_configs`. Defaults to `standard` daily at 02:00. The security worker calls `maybeRunAutoBackup()` each monitor cycle when `nextRun` has passed.

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
