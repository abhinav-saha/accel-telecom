const mongoose = require("mongoose");

const productSnapshotSchema = new mongoose.Schema({
  product_id: String,
  product_name: String,
  category: String,
  description: String,
  price_min_inr_per_month: Number,
  price_max_inr_per_month: Number,
  unit: String,
}, { _id: false, strict: false });

const savedBundleSchema = new mongoose.Schema({
  bundleId: { type: String, required: true },
  name: { type: String, required: true },
  description: String,
  reason: String,
  monthlyPrice: Number,
  products: { type: [productSnapshotSchema], default: [] },
  savedAt: { type: Date, default: Date.now },
});

const activeProductSchema = new mongoose.Schema({
  productId: String,
  productName: { type: String, required: true },
  description: String,
  activatedAt: Date,
  expiresAt: Date,
  status: { type: String, enum: ["Active", "Pending", "Expired", "Suspended"], default: "Active" },
}, { timestamps: true });

const consentSchema = new mongoose.Schema({
  isActive: { type: Boolean, default: false },
  acceptedAt: Date,
  withdrawnAt: Date,
  noticeVersion: String,
  purposes: { type: [String], default: [] },
  method: { type: String, default: "explicit-checkbox" },
}, { _id: false });

const businessProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  fullName: { type: String, trim: true, maxlength: 100, default: "" },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  phone: { type: String, trim: true, maxlength: 20, default: "" },
  businessName: { type: String, trim: true, maxlength: 160, default: "" },
  category: { type: String, trim: true, maxlength: 80, default: "" },
  location: { type: String, trim: true, maxlength: 160, default: "" },
  deliveryAddress: { type: String, trim: true, maxlength: 600, default: "" },
  savedBundles: { type: [savedBundleSchema], default: [] },
  activeProducts: { type: [activeProductSchema], default: [] },
  kycConsent: { type: consentSchema, default: () => ({}) },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model("BusinessProfile", businessProfileSchema);
