import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.DATABASE_PATH = './data/computer_dynamics.db';

const { initDatabase } = require('../packages/database/dist/connection.js');
const { SystemConfig } = require('../packages/database/dist/models/SystemConfig.js');

async function main() {
  await initDatabase();
  const keys = ['recaptcha_site_key', 'recaptcha_secret_key', 'bot_captcha_enabled'];
  for (const key of keys) {
    const value = await SystemConfig.getConfig(key, null);
    if (key === 'recaptcha_secret_key' && value) {
      console.log(key, '(configured, length', String(value).length + ')');
    } else {
      console.log(key, value);
    }
  }
  const { isRecaptchaRequired, getRecaptchaSiteKey } = require('../packages/security/dist/recaptcha.js');
  console.log('isRecaptchaRequired', await isRecaptchaRequired());
  console.log('effectiveSiteKey', await getRecaptchaSiteKey());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
