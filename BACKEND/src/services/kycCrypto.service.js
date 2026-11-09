const crypto = require("crypto");

function readHexKey(envName) {
  const value = process.env[envName];
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${envName} must be set to a 32-byte (64-character hex) secret.`);
  }
  return Buffer.from(value, "hex");
}

function encryptBuffer(plainBuffer) {
  const key = readHexKey("KYC_DATA_ENCRYPTION_KEY");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);

  return {
    buffer: encrypted,
    encryption: {
      algorithm: "aes-256-gcm",
      keyVersion: 1,
      iv: iv.toString("hex"),
      authTag: cipher.getAuthTag().toString("hex"),
    },
  };
}

function decryptBuffer(encryptedBuffer, encryption) {
  // Compatibility for documents uploaded by the earlier starter before encryption was added.
  if (!encryption || encryption.algorithm !== "aes-256-gcm") return encryptedBuffer;

  const key = readHexKey("KYC_DATA_ENCRYPTION_KEY");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encryption.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(encryption.authTag, "hex"));
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

function fingerprintIdentifier(type, value) {
  const key = readHexKey("KYC_LOOKUP_HMAC_KEY");
  const normalized = String(value || "").replace(/\s+/g, "").toUpperCase();
  return crypto
    .createHmac("sha256", key)
    .update(`${type}:${normalized}`)
    .digest("hex");
}

function maskIdentifier(value) {
  const normalized = String(value || "").replace(/\s+/g, "").toUpperCase();
  if (!normalized) return "";
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}${"•".repeat(Math.max(1, normalized.length - 4))}${normalized.slice(-2)}`;
  return `${normalized.slice(0, 4)}${"•".repeat(Math.min(6, normalized.length - 8))}${normalized.slice(-4)}`;
}

module.exports = { encryptBuffer, decryptBuffer, fingerprintIdentifier, maskIdentifier };
