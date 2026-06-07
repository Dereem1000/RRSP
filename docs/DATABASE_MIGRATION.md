# Database Migration Guide — v1 to v2

## Principle

**v2 does not create a new schema.** It connects to the existing `computer_dynamics.db` produced by the v1 Node/Sequelize application. All tables, columns, and password hashes remain unchanged.

## Recommended approach

### Development

1. Copy the database file (do not move the production file):

   ```bat
   mkdir data
   copy "F:\Computer Dynamics System\repair_workspace\repair_C.D_20251004_141630\working\server\database\computer_dynamics.db" "data\computer_dynamics.db"
   ```

2. In `.env`:

   ```env
   DATABASE_PATH=F:/Computer Dynamics System v2/data/computer_dynamics.db
   ```

3. Run `npm run db:verify` — confirms connection and record counts.

### Production cutover

**Option A — Same file (simplest)**

Point v2 at the live database path. **Stop v1 first** — SQLite does not handle concurrent writers from two apps well.

```env
DATABASE_PATH=F:/Computer Dynamics System/repair_workspace/.../computer_dynamics.db
```

**Option B — Copy then swap**

1. Stop v1
2. Copy DB to v2 `data/` folder
3. Start v2
4. Archive v1 codebase (keep for reference)

## What stays compatible

| Item | v1 | v2 | Notes |
|------|----|----|-------|
| SQLite file | ✅ | ✅ | Same file |
| `users` table | ✅ | ✅ | bcrypt passwords preserved |
| `clients` | ✅ | ✅ | UUID primary keys |
| `tickets` | ✅ | ✅ | camelCase column names in DB |
| `system_configs` | ✅ | ✅ | Maintenance mode, etc. |
| JWT secret | ✅ | ✅ | Set same `JWT_SECRET` in `.env` |

## Models ported (initial)

- `User`
- `Client`
- `Ticket`
- `SystemConfig`

## Models to port (tables already in DB)

From v1 `server/models/index.js`:

- Activity, SecurityEvent, Notification, NoticeBoard
- ClearanceBadge, FileUpload, Session
- Invoice, Payment, SLA, SLAViolation, Backup, EmergencyOverride
- Quote, Job, JobLink, Order, OrderLink, InvoiceLink
- ProductCategory, ProductService, ProductUsage
- Payroll, Payslip, TicketComment, Chat, UserActivity

Each model should copy **exact** `tableName`, `field` mappings, and timestamp settings from the v1 `.js` file.

## Sequelize settings (must match v1)

```typescript
define: {
  timestamps: false,
  underscored: true,
  freezeTableName: true,
}
```

Per-model overrides (examples):

- `users`: `createdAt: 'created_at'`, `updatedAt: 'updated_at'`
- `tickets`: `timestamps: false`, `underscored: false`, camelCase columns
- `clients`: snake_case columns via `field: 'company_name'` etc.

## Do NOT

- Run `sequelize.sync({ alter: true })` or migrations that change v1 tables
- Change password hashing rounds (stay at bcrypt 12)
- Rename tables or columns without a formal migration plan

## Verification checklist

- [ ] `npm run db:verify` shows correct counts
- [ ] Login with v1 admin account works
- [ ] Dashboard stats match v1 approximations
- [ ] Client role sees only linked client tickets
- [ ] Maintenance mode blocks non-admin login (from `system_configs`)

## Rollback

If v2 has issues, stop v2 and restart v1 against the same database file. No schema changes means instant rollback.
