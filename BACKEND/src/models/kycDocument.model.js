const mongoose = require("mongoose");

const registryCheckSchema = new mongoose.Schema({
  registry: { type: String, enum: ["mock-gstin-registry", "mock-udyam-registry"] },
  outcome: { type: String, default: "manual-review" },
  registrationStatus: { type: String, default: "" },
  checkedAt: Date,
  nameMatch: { type: Boolean, default: false },
  stateMatch: { type: Boolean, default: false },
  activityMatch: { type: Boolean, default: null },
  cityMatch: { type: Boolean, default: null },
  note: { type: String, default: "", maxlength: 1000 },
}, { _id: false });

const qualityCheckSchema = new mongoose.Schema({
  status: { type: String, enum: ["good", "review", "reupload-required"], default: "review" },
  blurVariance: Number,
  brightness: Number,
  contrast: Number,
  width: Number,
  height: Number,
  skewCorrectionDegrees: Number,
  deskewed: { type: Boolean, default: false },
  warnings: { type: [String], default: [] },
  issues: { type: [String], default: [] },
  checkedAt: Date,
}, { _id: false });

const classificationSchema = new mongoose.Schema({
  expectedType: { type: String, enum: ["addressProof", "gstCertificate", "udyamCertificate", "signatoryId"] },
  detectedType: { type: String, default: "unknown" },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  outcome: { type: String, enum: ["matched", "mismatch", "uncertain"], default: "uncertain" },
  matchesExpectedType: { type: Boolean, default: null },
  note: { type: String, default: "", maxlength: 500 },
  checkedAt: Date,
}, { _id: false });

const reviewHistorySchema = new mongoose.Schema({
  status: { type: String, enum: ["pending", "accepted", "rejected"], required: true },
  reason: { type: String, default: "", maxlength: 1000 },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date, default: Date.now },
}, { _id: false });

const kycDocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["addressProof", "gstCertificate", "udyamCertificate", "signatoryId"], required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  originalName: { type: String, required: true, maxlength: 140 },
  mimeType: { type: String, required: true, enum: ["image/jpeg", "image/png", "image/webp"] },
  size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
  status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending", index: true },
  rejectionReason: { type: String, default: "", maxlength: 1000 },
  reviewNote: { type: String, default: "", maxlength: 1000 },
  issueDate: Date,
  issueDateConfidence: { type: String, enum: ["detected", "not-detected", "manual-review"], default: "not-detected" },
  ocrCompletedAt: Date,
  maskedIdentifier: { type: String, default: "" },
  identifierFingerprint: { type: String, default: "", select: false },
  registryCheck: { type: registryCheckSchema, default: undefined },
  qualityCheck: { type: qualityCheckSchema, default: undefined },
  classification: { type: classificationSchema, default: undefined },
  fieldPresence: {
    identifier: { type: Boolean, default: false },
    businessName: { type: Boolean, default: false },
    tradeName: { type: Boolean, default: false },
    state: { type: Boolean, default: false },
    majorActivity: { type: Boolean, default: false },
    city: { type: Boolean, default: false },
    issueDate: { type: Boolean, default: false },
    stateInferredFromGstin: { type: Boolean, default: false },
    signatoryNameLabel: { type: Boolean, default: false },
  },
  verificationSource: { type: String, enum: ["mock-registry", "ocr-date-check", "document-quality", "manual-review"], default: "manual-review" },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  reviewHistory: { type: [reviewHistorySchema], default: [] },
  isCurrent: { type: Boolean, default: true, index: true },
  replacedAt: Date,
}, { timestamps: true });

kycDocumentSchema.index({ userId: 1, type: 1, isCurrent: 1 });
kycDocumentSchema.index({ identifierFingerprint: 1 }, { sparse: true });

module.exports = mongoose.model("KycDocument", kycDocumentSchema);
