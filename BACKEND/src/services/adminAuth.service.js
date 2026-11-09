const crypto = require("crypto");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  if (!salt || !storedHash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_JWT_SECRET must be set to a random value of at least 32 characters.");
  }
  return secret;
}

function signAdminToken(admin) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: String(admin._id),
    role: "admin",
    email: admin.email,
    iat: now,
    exp: now + 8 * 60 * 60,
  })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", getSecret()).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function verifyAdminToken(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac("sha256", getSecret()).update(unsigned).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (header.alg !== "HS256" || payload.role !== "admin" || !payload.sub || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signAdminToken, verifyAdminToken };
