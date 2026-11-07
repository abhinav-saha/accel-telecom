const mongoose = require("mongoose");

const kycDocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["addressProof", "gstCertificate", "udyamCertificate", "signatoryId"], required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending", index: true },
  rejectionReason: { type: String, default: "", maxlength: 1000 },
  reviewNote: { type: String, default: "", maxlength: 1000 },
  issueDate: Date,
  issueDateConfidence: { type: String, enum: ["detected", "not-detected", "manual-review"], default: "not-detected" },
  ocrCompletedAt: Date,
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  isCurrent: { type: Boolean, default: true, index: true },
  replacedAt: Date,
}, { timestamps: true });

kycDocumentSchema.index({ userId: 1, type: 1, isCurrent: 1 });
module.exports = mongoose.model("KycDocument", kycDocumentSchema);
