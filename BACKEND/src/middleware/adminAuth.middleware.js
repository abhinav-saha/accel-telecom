const Admin = require("../models/admin.model");
const { verifyAdminToken } = require("../services/adminAuth.service");

async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const payload = verifyAdminToken(token);
    if (!payload) return res.status(401).json({ message: "Admin login is required." });

    const admin = await Admin.findById(payload.sub).select("_id email role").lean();
    if (!admin || admin.role !== "admin") {
      return res.status(401).json({ message: "Admin account is not authorised." });
    }
    req.admin = admin;
    req.user = admin;
    next();
  } catch (error) {
    if (error.message?.includes("ADMIN_JWT_SECRET")) {
      return res.status(503).json({ message: "Admin authentication is not configured on the server." });
    }
    return res.status(500).json({ message: "Could not verify admin access." });
  }
}

module.exports = { requireAdmin };
