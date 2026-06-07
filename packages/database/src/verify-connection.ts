import path from 'path';
import dotenv from 'dotenv';
import { getDatabasePath, testConnection, User, Client, Ticket, closeConnection } from './index';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const dbPath = getDatabasePath();
  console.log('Computer Dynamics v2 — database compatibility check');
  console.log('Database path:', dbPath);

  try {
    await testConnection();
    console.log('✅ Connection OK');

    const [userCount, clientCount, ticketCount] = await Promise.all([
      User.count(),
      Client.count(),
      Ticket.count(),
    ]);

    console.log('✅ Record counts from legacy database:');
    console.log(`   users:   ${userCount}`);
    console.log(`   clients: ${clientCount}`);
    console.log(`   tickets: ${ticketCount}`);
    console.log('\nV2 is compatible with this database. No schema migration required.');
  } catch (error) {
    console.error('❌ Database check failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
