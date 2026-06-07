import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export {
  User,
  Client,
  Ticket,
  TicketComment,
  SystemConfig,
  NoticeBoard,
  testConnection,
  getDatabasePath,
  getSequelize,
} from '@cd-v2/database';

export function publicUser(user: {
  id: number;
  username: string;
  email: string;
  role: string;
  securityClearance: string;
  firstName: string;
  lastName: string;
  passwordSet?: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    securityClearance: user.securityClearance,
    firstName: user.firstName,
    lastName: user.lastName,
    passwordSet: user.passwordSet,
  };
}
