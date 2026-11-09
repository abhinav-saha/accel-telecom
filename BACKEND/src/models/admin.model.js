const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  role: { type: String, enum: ["admin"], default: "admin" },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Admin", adminSchema);
