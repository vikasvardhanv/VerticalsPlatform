/**
 * AES-256-GCM Encryption Service
 * Provides encryption at rest for all sensitive data
 */

const crypto = require('crypto');

class EncryptionService {
  constructor(masterKey) {
    if (!masterKey || masterKey.length !== 64) {
      throw new Error('Master encryption key must be a 64-character hex string (256 bits)');
    }

    this.algorithm = 'aes-256-gcm';
    this.masterKey = Buffer.from(masterKey, 'hex');
    this.ivLength = 16; // 128 bits
    this.authTagLength = 16; // 128 bits
  }

  /**
   * Encrypt plaintext data
   * @param {string} plaintext - The data to encrypt
   * @param {object} additionalData - Optional authenticated additional data (AAD)
   * @returns {object} Encrypted data with IV and auth tag
   */
  encrypt(plaintext, additionalData = null) {
    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

      // Add additional authenticated data if provided
      if (additionalData) {
        cipher.setAAD(Buffer.from(JSON.stringify(additionalData)));
      }

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get auth tag
      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt encrypted data
   * @param {object} encryptedData - Object containing encrypted, iv, and authTag
   * @param {object} additionalData - Optional authenticated additional data (AAD)
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData, additionalData = null) {
    try {
      const { encrypted, iv, authTag } = encryptedData;

      if (!encrypted || !iv || !authTag) {
        throw new Error('Invalid encrypted data format');
      }

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.masterKey,
        Buffer.from(iv, 'hex')
      );

      // Set auth tag
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      // Add additional authenticated data if provided
      if (additionalData) {
        decipher.setAAD(Buffer.from(JSON.stringify(additionalData)));
      }

      // Decrypt
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt JSON object
   * @param {object} obj - Object to encrypt
   * @param {object} additionalData - Optional AAD
   * @returns {object} Encrypted object
   */
  encryptObject(obj, additionalData = null) {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString, additionalData);
  }

  /**
   * Decrypt to JSON object
   * @param {object} encryptedData - Encrypted object
   * @param {object} additionalData - Optional AAD
   * @returns {object} Decrypted object
   */
  decryptObject(encryptedData, additionalData = null) {
    const jsonString = this.decrypt(encryptedData, additionalData);
    return JSON.parse(jsonString);
  }

  /**
   * Generate cryptographically secure hash
   * @param {string} data - Data to hash
   * @param {string} algorithm - Hash algorithm (default: sha256)
   * @returns {string} Hex-encoded hash
   */
  hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Generate random token
   * @param {number} bytes - Number of random bytes (default: 32)
   * @returns {string} Hex-encoded random token
   */
  generateToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Constant-time string comparison (prevents timing attacks)
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} True if strings are equal
   */
  secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }
}

module.exports = EncryptionService;
