const path = require('path');
process.env.CD_V2_ROOT = path.join(__dirname, '..');
const { getSequelize } = require('../packages/database/dist/connection.js');

(async () => {
  const seq = getSequelize();
  const [rows] = await seq.query(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log(rows.map((r) => r.name).join('\n'));
  const emergency = rows.find((r) => r.name === 'emergency_overrides');
  if (emergency) {
    const [info] = await seq.query('PRAGMA table_info(emergency_overrides)');
    console.log('\nemergency_overrides columns:');
    console.log(info.map((c) => c.name).join(', '));
  }
  const [configs] = await seq.query(
    "SELECT key, value FROM system_configs WHERE key LIKE '%emergency%' OR key LIKE '%ai_security%'"
  );
  console.log('\nsecurity configs:', configs);
  const [sample] = await seq.query('SELECT id, user_id, status FROM emergency_overrides LIMIT 2');
  console.log('\nsample overrides:', sample);
  const [dev] = await seq.query(
    "SELECT key, value FROM system_configs WHERE key LIKE '%developer%' OR key LIKE '%demo%'"
  );
  console.log('\ndev configs:', dev);
  const [se] = await seq.query('PRAGMA table_info(security_events)');
  console.log('\nsecurity_events cols:', se.map((c) => c.name).join(', '));
  await seq.close();
})();
