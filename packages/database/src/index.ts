import type { Sequelize } from 'sequelize';
import { getSequelize, setSequelizeRecreateHook } from './connection';
import { User } from './models/User';
import { Client } from './models/Client';
import { Ticket } from './models/Ticket';
import { TicketComment } from './models/TicketComment';
import { SystemConfig } from './models/SystemConfig';
import { NoticeBoard } from './models/NoticeBoard';
import { EmergencyOverride } from './models/EmergencyOverride';
import { SecurityEvent } from './models/SecurityEvent';
import { Backup } from './models/Backup';
import { SalesOpportunity } from './models/SalesOpportunity';
import { CalendarEvent } from './models/CalendarEvent';

Client.hasMany(Ticket, { foreignKey: 'clientId' });
SalesOpportunity.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Ticket.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

User.hasMany(Ticket, { as: 'createdTickets', foreignKey: 'createdBy' });
User.hasMany(Ticket, { as: 'assignedTickets', foreignKey: 'assignedTo' });
Ticket.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
Ticket.belongsTo(User, { as: 'assignee', foreignKey: 'assignedTo' });

Ticket.hasMany(TicketComment, { foreignKey: 'ticketId' });
TicketComment.belongsTo(Ticket, { foreignKey: 'ticketId' });

User.hasMany(EmergencyOverride, { foreignKey: 'userId' });
EmergencyOverride.belongsTo(User, { foreignKey: 'userId' });

export const models = {
  User,
  Client,
  Ticket,
  TicketComment,
  SystemConfig,
  NoticeBoard,
  EmergencyOverride,
  SecurityEvent,
  Backup,
  SalesOpportunity,
  CalendarEvent,
};

function rebindModelsToSequelize(db: Sequelize) {
  for (const model of Object.values(models)) {
    Object.defineProperty(model, 'sequelize', { value: db, configurable: true });
    db.models[model.name] = model;
  }
}

setSequelizeRecreateHook(rebindModelsToSequelize);
rebindModelsToSequelize(getSequelize());

export { getSequelize, getDatabasePath, getLiveDatabasePath, getMonorepoRoot, testConnection, closeConnection, reopenConnection, setSequelizeRecreateHook } from './connection';
export { ensureSalesSchema } from './ensure-sales-schema';
export { ensureCalendarSchema } from './ensure-calendar-schema';
export { ensureEmailLogSchema } from './ensure-email-log-schema';
export {
  disableDemoSandbox,
  enableDemoSandbox,
  getDemoActiveMarkerPath,
  getDemoSandboxDir,
  getDemoSnapshotPath,
  isDemoSandboxActive,
  syncDemoModeFromMarker,
} from './demo-sandbox';
export { isDemoModeActive, setDemoModeCache } from './demo-mode';
export {
  getBackupAppPaths,
  getBackupOnlyPaths,
  getLicenseProtectedFilePaths,
  getProtectedFilePaths,
} from './protected-paths';

export {
  User,
  Client,
  Ticket,
  TicketComment,
  SystemConfig,
  NoticeBoard,
  EmergencyOverride,
  SecurityEvent,
  Backup,
  SalesOpportunity,
  CalendarEvent,
};
export type { BackupType, BackupStatus } from './models/Backup';
export type { SalesStage, SalesProduct, SalesDealType } from './models/SalesOpportunity';
export type { CalendarEventType } from './models/CalendarEvent';
