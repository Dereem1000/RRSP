const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('F:\\Computer Dynamics System v2\\data\\computer_dynamics.live.db');

db.all(`
  SELECT id, event_type, description, ip_address, user_agent, request_path, created_at, details
  FROM security_events
  WHERE description LIKE '%LIC-8EE4F64D%'
  ORDER BY created_at DESC LIMIT 3
`, (err, rows) => {
  console.log('LIC-8EE4F64D events with UA:', JSON.stringify(rows, null, 2));
  
  db.all(`
    SELECT id, event_type, description, ip_address, user_agent, request_path, created_at
    FROM security_events
    WHERE ip_address = '201.221.77.147' AND created_at > '2026-08-01'
    ORDER BY created_at DESC LIMIT 30
  `, (e2, all) => {
    console.log('\nAll events from 201.221.77.147 on Aug 1-2:', JSON.stringify(all, null, 2));
    db.close();
  });
});
