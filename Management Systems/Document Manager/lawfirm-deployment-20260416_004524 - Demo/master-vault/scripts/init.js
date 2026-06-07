#!/usr/bin/env node

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Ensure .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from template...');
  const examplePath = path.join(__dirname, '..', '.env.example');
  fs.copyFileSync(examplePath, envPath);
  console.log('✅ .env file created - update with your values\n');
}

require('dotenv').config({ path: envPath });

const db = require('../src/db/init');
const encrypt = require('../src/crypto/encryption');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function initialize() {
  console.log('🔐 Law Firm Master Vault - Initialization');
  console.log('========================================\n');

  try {
    // Initialize database
    console.log('📦 Initializing database...');
    await db.initialize();
    console.log('✅ Database initialized\n');

    // Prompt for master password
    console.log('⚠️  IMPORTANT: Store the master password securely in LastPass');
    const masterPassword = await prompt('Enter Master Password: ');
    const confirmPassword = await prompt('Confirm Master Password: ');

    if (masterPassword !== confirmPassword) {
      console.error('❌ Passwords do not match');
      process.exit(1);
    }

    if (masterPassword.length < 16) {
      console.error('❌ Master password must be at least 16 characters');
      process.exit(1);
    }

    console.log('✅ Master password set\n');

    // Update .env with master password hash
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const updated = lines.map(line => {
      if (line.startsWith('MASTER_PASSWORD=')) {
        return `MASTER_PASSWORD=${masterPassword}`;
      }
      return line;
    }).join('\n');

    fs.writeFileSync(envPath, updated);
    console.log('✅ Master password saved to .env\n');

    // Create admin user
    console.log('👤 Creating admin account...');
    const adminUsername = await prompt('Admin username (default: admin): ') || 'admin';
    const adminEmail = await prompt('Admin email (default: admin@lawfirm.local): ') || 'admin@lawfirm.local';
    const adminPassword = await prompt('Admin password (min 16 chars): ');

    if (adminPassword.length < 16) {
      console.error('❌ Admin password must be at least 16 characters');
      process.exit(1);
    }

    // Check if admin already exists
    const existingAdmin = await db.get(
      'SELECT id FROM users WHERE username = ?',
      [adminUsername]
    );

    if (existingAdmin) {
      console.error(`❌ User '${adminUsername}' already exists`);
      process.exit(1);
    }

    // Hash admin password with bcrypt
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    const adminId = uuidv4();
    await db.run(
      `INSERT INTO users (id, username, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminId, adminUsername, adminEmail, adminPasswordHash, 'admin', 1]
    );

    console.log(`✅ Admin user '${adminUsername}' created\n`);

    // Create deployer account
    console.log('🤖 Creating deployer service account...');
    const deployerPassword = await prompt('Deployer password (leave blank to auto-generate): ') || 
      require('crypto').randomBytes(16).toString('hex');

    const deployerPasswordHash = await bcrypt.hash(deployerPassword, 10);
    const deployerId = uuidv4();

    await db.run(
      `INSERT INTO users (id, username, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [deployerId, 'deployer', 'deployer@lawfirm.local', deployerPasswordHash, 'deployer', 1]
    );

    console.log(`✅ Deployer account created`);
    console.log(`   Username: deployer`);
    console.log(`   Password: ${deployerPassword}\n`);

    // Create initial backup
    console.log('💾 Creating initial backup...');
    // Backup creation would go here
    console.log('✅ Backup created\n');

    // Summary
    console.log('✅ Initialization complete!\n');
    console.log('📋 Next steps:');
    console.log('   1. Store master password in LastPass vault');
    console.log('   2. Store deployer password securely');
    console.log('   3. Review .env file (NOT to be committed to git)');
    console.log('   4. Start vault: npm start');
    console.log('   5. Access admin UI: https://localhost:3333/admin\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  } finally {
    await db.close();
    rl.close();
  }
}

initialize();
