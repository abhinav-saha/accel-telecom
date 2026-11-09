require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/admin.model");
const { hashPassword } = require("../services/adminAuth.service");

async function main() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing from the backend .env file.");
  if (!email || !password || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in the backend .env file.");
  }
  if (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.length < 32) {
    throw new Error("Set ADMIN_JWT_SECRET to a random value of at least 32 characters in the backend .env file.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`Admin account ${email} already exists. No changes made.`);
    return;
  }
  const { salt, hash } = hashPassword(password);
  await Admin.create({ email, passwordSalt: salt, passwordHash: hash, role: "admin" });
  console.log(`Admin account created for ${email}.`);
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
