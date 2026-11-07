const mongoose = require("mongoose");
const BusinessProfile = require("../models/businessProfile.model");
const KycDocument = require("../models/kycDocument.model");
const Order = require("../models/order.model");
const { runOcr, findIssueDate, validateAddressProofDate } = require("../services/kycOcr.service");

const KYC_TYPES = new Set(["addressProof", "gstCertificate", "udyamCertificate", "signatoryId"]);
const KYC_PURPOSES = ["business-identity-verification", "address-verification", "product-eligibility-checks", "fraud-prevention-and-onboarding"];

function currentUserId(req) {
  return req.user?._id || req.user?.id;
}

async function getOrCreateProfile(userId) {
  let profile = await BusinessProfile.findOne({ userId });
  if (!profile) profile = await BusinessProfile.create({ userId });
  return profile;
}

function getBucket() {
  if (!mongoose.connection.db) throw new Error("Database connection is not ready.");
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "kycFiles" });
}

exports.getBusinessProfile = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    // Prefill basic account details from the authenticated user object when available.
    let changed = false;
    if (!profile.fullName && (req.user?.fullName || req.user?.username)) { profile.fullName = req.user.fullName || req.user.username; changed = true; }
    if (!profile.email && req.user?.email) { profile.email = req.user.email; changed = true; }
    if (changed) await profile.save();
    res.json({ profile: profile.toObject() });
  } catch (error) { res.status(500).json({ message: "Could not load your profile." }); }
};

exports.updateBusinessProfile = async (req, res) => {
  try {
    const allowed = ["fullName", "email", "phone", "businessName", "category", "location", "deliveryAddress"];
    const update = {};
    for (const key of allowed) if (typeof req.body[key] === "string") update[key] = req.body[key].trim();
    if (update.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (update.phone && !/^[+0-9 ()-]{7,20}$/.test(update.phone)) return res.status(400).json({ message: "Enter a valid phone number." });
    const profile = await BusinessProfile.findOneAndUpdate(
      { userId: currentUserId(req) }, { $set: update, $setOnInsert: { userId: currentUserId(req) } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ message: "Business profile updated.", profile });
  } catch (error) { res.status(400).json({ message: error.message || "Could not update your profile." }); }
};

exports.getSavedBundles = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    res.json({ bundles: profile.savedBundles });
  } catch (error) { res.status(500).json({ message: "Could not load saved bundles." }); }
};

exports.saveBundle = async (req, res) => {
  try {
    const { bundleId, name, description = "", reason = "", monthlyPrice = 0, products = [] } = req.body;
    if (!bundleId || !name || !Array.isArray(products)) return res.status(400).json({ message: "Bundle ID, name and products are required." });
    if (products.length > 25) return res.status(400).json({ message: "A bundle cannot contain more than 25 products." });
    const profile = await getOrCreateProfile(currentUserId(req));
    const existing = profile.savedBundles.find((bundle) => bundle.bundleId === String(bundleId));
    if (existing) return res.status(409).json({ message: "This bundle is already saved." });
    profile.savedBundles.push({ bundleId: String(bundleId), name: String(name).slice(0, 120), description: String(description).slice(0, 500), reason: String(reason).slice(0, 500), monthlyPrice: Math.max(0, Number(monthlyPrice) || 0), products });
    await profile.save();
    res.status(201).json({ message: "Bundle saved.", bundles: profile.savedBundles });
  } catch (error) { res.status(400).json({ message: "Could not save this bundle." }); }
};

exports.deleteSavedBundle = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    profile.savedBundles = profile.savedBundles.filter((bundle) => String(bundle._id) !== req.params.bundleId && bundle.bundleId !== req.params.bundleId);
    await profile.save();
    res.json({ message: "Saved bundle removed." });
  } catch (error) { res.status(500).json({ message: "Could not remove this bundle." }); }
};

exports.getActiveProducts = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    res.json({ products: profile.activeProducts });
  } catch (error) { res.status(500).json({ message: "Could not load active products." }); }
};

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: currentUserId(req) }).sort({ createdAt: -1 }).lean();
    res.json({ orders });
  } catch (error) { res.status(500).json({ message: "Could not load order history." }); }
};

exports.saveKycConsent = async (req, res) => {
  try {
    if (req.body.accepted !== true || req.body.noticeVersion !== "kyc-notice-v1") return res.status(400).json({ message: "A valid affirmative KYC consent is required." });
    const profile = await getOrCreateProfile(currentUserId(req));
    profile.kycConsent = { isActive: true, acceptedAt: new Date(), withdrawnAt: null, noticeVersion: "kyc-notice-v1", purposes: KYC_PURPOSES, method: "explicit-checkbox" };
    await profile.save();
    res.json({ message: "KYC consent saved.", consent: profile.kycConsent });
  } catch (error) { res.status(500).json({ message: "Could not save your consent." }); }
};

exports.withdrawKycConsent = async (req, res) => {
  try {
    const profile = await BusinessProfile.findOne({ userId: currentUserId(req) });
    if (!profile) return res.status(404).json({ message: "Profile not found." });
    profile.kycConsent.isActive = false;
    profile.kycConsent.withdrawnAt = new Date();
    await profile.save();
    res.json({ message: "KYC consent withdrawn. New uploads are disabled; previously collected documents are handled under the published retention policy and any applicable legal obligations.", consent: profile.kycConsent });
  } catch (error) { res.status(500).json({ message: "Could not withdraw consent." }); }
};

exports.getKycDocuments = async (req, res) => {
  try {
    const [documents, profile] = await Promise.all([
      KycDocument.find({ userId: currentUserId(req) }).sort({ createdAt: -1 }).select("type originalName mimeType size status rejectionReason reviewNote issueDate issueDateConfidence ocrCompletedAt reviewedAt isCurrent createdAt updatedAt").lean(),
      BusinessProfile.findOne({ userId: currentUserId(req) }).select("kycConsent").lean(),
    ]);
    res.json({ documents, consent: profile?.kycConsent || null });
  } catch (error) { res.status(500).json({ message: "Could not load KYC documents." }); }
};

exports.uploadKycDocument = async (req, res) => {
  let uploadedFileId;
  try {
    const { type } = req.params;
    if (!KYC_TYPES.has(type)) return res.status(400).json({ message: "Unknown KYC document type." });
    if (!req.file) return res.status(400).json({ message: "Choose a document to upload." });
    const profile = await BusinessProfile.findOne({ userId: currentUserId(req) });
    if (!profile?.kycConsent?.isActive || !profile.kycConsent.acceptedAt) return res.status(403).json({ message: "Please read the KYC privacy notice and give consent before uploading." });

    let ocrText = "";
    try { ocrText = await runOcr(req.file.buffer); }
    catch (ocrError) { ocrText = ""; }
    const issueDate = findIssueDate(ocrText);
    let status = "pending";
    let reviewNote = ocrText ? "OCR completed. Final document and registry verification is pending." : "OCR could not read this image reliably. Manual review is required.";
    let rejectionReason = "";
    if (type === "addressProof") {
      const dateCheck = validateAddressProofDate(issueDate);
      status = dateCheck.status;
      if (status === "rejected") rejectionReason = dateCheck.reason;
      else reviewNote = dateCheck.reason;
    }

    const bucket = getBucket();
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const uploadStream = bucket.openUploadStream(safeName, {
      contentType: req.file.mimetype,
      metadata: { userId: String(currentUserId(req)), type, uploadedAt: new Date() },
    });
    uploadedFileId = uploadStream.id;
    await new Promise((resolve, reject) => {
      uploadStream.once("finish", resolve);
      uploadStream.once("error", reject);
      uploadStream.end(req.file.buffer);
    });

    await KycDocument.updateMany({ userId: currentUserId(req), type, isCurrent: true }, { $set: { isCurrent: false, replacedAt: new Date() } });
    const document = await KycDocument.create({
      userId: currentUserId(req), type, fileId: uploadedFileId,
      originalName: safeName, mimeType: req.file.mimetype, size: req.file.size,
      status, rejectionReason, reviewNote, issueDate,
      issueDateConfidence: issueDate ? "detected" : "manual-review",
      ocrCompletedAt: ocrText ? new Date() : null, isCurrent: true,
    });
    res.status(201).json({ message: status === "rejected" ? rejectionReason : "Document uploaded and queued for review.", document: { _id: document._id, type: document.type, status: document.status, rejectionReason: document.rejectionReason, reviewNote: document.reviewNote } });
  } catch (error) {
    if (uploadedFileId && mongoose.connection.db) {
      try { await getBucket().delete(uploadedFileId); } catch (_) { /* best-effort cleanup */ }
    }
    res.status(500).json({ message: "Document upload failed. Please try again." });
  }
};

exports.getKycFile = async (req, res) => {
  try {
    const document = await KycDocument.findOne({ _id: req.params.documentId, userId: currentUserId(req) });
    if (!document) return res.status(404).json({ message: "Document not found." });
    res.set("Content-Type", document.mimeType);
    res.set("Content-Disposition", `inline; filename="${document.originalName.replace(/"/g, "")}"`);
    res.set("Cache-Control", "private, no-store");
    const downloadStream = getBucket().openDownloadStream(document.fileId);
    downloadStream.on("error", () => { if (!res.headersSent) res.status(404).json({ message: "Stored file not found." }); else res.destroy(); });
    downloadStream.pipe(res);
  } catch (error) { res.status(500).json({ message: "Could not open this document." }); }
};

exports.reviewKycDocument = async (req, res) => {
  try {
    // This route must be restricted to an authorised reviewer/admin. Customers cannot self-approve KYC.
    if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Reviewer access is required." });
    const { status, rejectionReason = "" } = req.body;
    if (!["accepted", "rejected"].includes(status)) return res.status(400).json({ message: "Status must be accepted or rejected." });
    if (status === "rejected" && !String(rejectionReason).trim()) return res.status(400).json({ message: "Provide a reason when rejecting a document." });
    const document = await KycDocument.findByIdAndUpdate(req.params.documentId, {
      $set: { status, rejectionReason: status === "rejected" ? String(rejectionReason).trim().slice(0, 1000) : "", reviewNote: "", reviewerId: currentUserId(req), reviewedAt: new Date() },
    }, { new: true });
    if (!document) return res.status(404).json({ message: "Document not found." });
    res.json({ message: "KYC review saved.", document });
  } catch (error) { res.status(500).json({ message: "Could not update KYC status." }); }
};
