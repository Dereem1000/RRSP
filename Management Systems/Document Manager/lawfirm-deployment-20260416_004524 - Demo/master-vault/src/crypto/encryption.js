const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16; // 128 bits
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Derive encryption key from master password using PBKDF2
 * @param {string} masterPassword - The master vault password
 * @param {Buffer} salt - Random salt for key derivation
 * @returns {Buffer} Derived encryption key (32 bytes for AES-256)
 */
function deriveKey(masterPassword, salt) {
  return crypto.pbkdf2Sync(
    masterPassword,
    salt,
    ITERATIONS,
    32, // 256 bits for AES-256
    'sha256'
  );
}

/**
 * Encrypt a secret using AES-256-GCM
 * @param {string} plaintext - Secret to encrypt
 * @param {string} masterPassword - Master vault password
 * @returns {object} { encryptedData, iv, authTag, salt }
 */
function encrypt(plaintext, masterPassword) {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(12); // 96 bits for GCM

    // Derive encryption key from master password
    const key = deriveKey(masterPassword, salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encryptedData = cipher.update(plaintext, 'utf8', 'hex');
    encryptedData += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encryptedData,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt a secret using AES-256-GCM
 * @param {string} encryptedData - Encrypted data in hex
 * @param {string} iv - Initialization vector in hex
 * @param {string} authTag - Authentication tag in hex
 * @param {string} salt - Salt in hex
 * @param {string} masterPassword - Master vault password
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedData, iv, authTag, salt, masterPassword) {
  try {
    // Convert from hex to buffers
    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');

    // Derive the same key using the same salt
    const key = deriveKey(masterPassword, saltBuffer);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);

    // Set authentication tag for verification
    decipher.setAuthTag(authTagBuffer);

    // Decrypt
    let decryptedData = decipher.update(encryptedData, 'hex', 'utf8');
    decryptedData += decipher.final('utf8');

    return decryptedData;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Hash a password for storage (bcrypt is recommended in practice)
 * This is just for the master password - use bcryptjs for user passwords
 * @param {string} password - Password to hash
 * @returns {string} Hash in hex format
 */
function hashPassword(password) {
  try {
    const hash = crypto
      .createHash('sha256')
      .update(password + process.env.PASSWORD_SALT || 'default-salt')
      .digest('hex');
    return hash;
  } catch (error) {
    throw new Error(`Password hashing failed: ${error.message}`);
  }
}

/**
 * Verify a password against its hash
 * @param {string} password - Password to verify
 * @param {string} hash - Hash to compare against
 * @returns {boolean} True if password matches
 */
function verifyPassword(password, hash) {
  const newHash = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(newHash));
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  deriveKey,
};
