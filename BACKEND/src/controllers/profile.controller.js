const mongoose = require("mongoose");
const BusinessProfile = require("../models/businessProfile.model");
const KycDocument = require("../models/kycDocument.model");
const Order = require("../models/order.model");
const { runOcr, extractKycFields, validateAddressProofDate } = require("../services/kycOcr.service");
const { verifyGstin, verifyUdyam } = require("../services/registryVerification.service");
const { classifyDocument } = require("../services/documentClassification.service");
const { inspectDocumentImage } = require("../services/documentQuality.service");
const { encryptBuffer, decryptBuffer } = require("../services/kycCrypto.service");

const KYC_TYPES = new Set(["addressProof", "gstCertificate", "udyamCertificate", "signatoryId"]);
const KYC_PURPOSES = [
  "business-identity-verification",
  "address-verification",
  "product-eligibility-checks",
  "fraud-prevention-and-onboarding",
];

function currentUserId(req) {
  return req.user?._id || req.user?.id;
}

async function getOrCreateProfile(userId) {
  if (!userId) throw new Error("Authenticated user is required.");
  let profile = await BusinessProfile.findOne({ userId });
  if (!profile) profile = await BusinessProfile.create({ userId });
  return profile;
}

function getBucket() {
  if (!mongoose.connection.db) throw new Error("Database connection is not ready.");
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "kycFiles" });
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

function safeKycDocument(document) {
  return {
    _id: document._id,
    type: document.type,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    status: document.status,
    rejectionReason: document.rejectionReason,
    reviewNote: document.reviewNote,
    issueDate: document.issueDate,
    issueDateConfidence: document.issueDateConfidence,
    ocrCompletedAt: document.ocrCompletedAt,
    maskedIdentifier: document.maskedIdentifier,
    registryCheck: document.registryCheck,
    qualityCheck: document.qualityCheck,
    classification: document.classification,
    fieldPresence: document.fieldPresence,
    reviewedAt: document.reviewedAt,
    reviewHistory: (document.reviewHistory || []).map((entry) => ({ status: entry.status, reason: entry.reason, reviewedAt: entry.reviewedAt })),
    isCurrent: document.isCurrent,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

exports.getBusinessProfile = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    let changed = false;
    if (!profile.fullName && (req.user?.fullName || req.user?.username)) {
      profile.fullName = req.user.fullName || req.user.username;
      changed = true;
    }
    if (!profile.email && req.user?.email) {
      profile.email = req.user.email;
      changed = true;
    }
    if (changed) await profile.save();
    res.json({ profile: profile.toObject() });
  } catch (_) {
    res.status(500).json({ message: "Could not load your profile." });
  }
};

exports.updateBusinessProfile = async (req, res) => {
  try {
    const allowed = ["fullName", "email", "phone", "businessName", "category", "location", "deliveryAddress"];
    const update = {};
    for (const key of allowed) {
      if (typeof req.body[key] === "string") update[key] = req.body[key].trim();
    }
    if (update.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    if (update.phone && !/^[+0-9 ()-]{7,20}$/.test(update.phone)) {
      return res.status(400).json({ message: "Enter a valid phone number." });
    }
    const profile = await BusinessProfile.findOneAndUpdate(
      { userId: currentUserId(req) },
      { $set: update, $setOnInsert: { userId: currentUserId(req) } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ message: "Business profile updated.", profile });
  } catch (_) {
    res.status(400).json({ message: "Could not update your profile. Check the submitted fields." });
  }
};

exports.getSavedBundles = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    res.json({ bundles: profile.savedBundles });
  } catch (_) {
    res.status(500).json({ message: "Could not load saved bundles." });
  }
};

exports.saveBundle = async (req, res) => {
  try {
    const { bundleId, name, description = "", reason = "", monthlyPrice = 0, products = [] } = req.body;
    if (!bundleId || !name || !Array.isArray(products)) {
      return res.status(400).json({ message: "Bundle ID, name and products are required." });
    }
    if (products.length > 25) return res.status(400).json({ message: "A bundle cannot contain more than 25 products." });
    const profile = await getOrCreateProfile(currentUserId(req));
    const existing = profile.savedBundles.find((bundle) => bundle.bundleId === String(bundleId));
    if (existing) return res.status(409).json({ message: "This bundle is already saved." });
    profile.savedBundles.push({
      bundleId: String(bundleId),
      name: String(name).slice(0, 120),
      description: String(description).slice(0, 500),
      reason: String(reason).slice(0, 500),
      monthlyPrice: Math.max(0, Number(monthlyPrice) || 0),
      products,
    });
    await profile.save();
    res.status(201).json({ message: "Bundle saved.", bundles: profile.savedBundles });
  } catch (_) {
    res.status(400).json({ message: "Could not save this bundle." });
  }
};

exports.deleteSavedBundle = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    profile.savedBundles = profile.savedBundles.filter(
      (bundle) => String(bundle._id) !== req.params.bundleId && bundle.bundleId !== req.params.bundleId
    );
    await profile.save();
    res.json({ message: "Saved bundle removed." });
  } catch (_) {
    res.status(500).json({ message: "Could not remove this bundle." });
  }
};

exports.getActiveProducts = async (req, res) => {
  try {
    const profile = await getOrCreateProfile(currentUserId(req));
    res.json({ products: profile.activeProducts });
  } catch (_) {
    res.status(500).json({ message: "Could not load active products." });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: currentUserId(req) }).sort({ createdAt: -1 }).lean();
    const safeOrders = orders.map((order) => ({
      ...order,
      trackingHistory: (order.trackingHistory || []).map(({ status, message, updatedAt }) => ({ status, message, updatedAt })),
    }));
    res.json({ orders: safeOrders });
  } catch (_) {
    res.status(500).json({ message: "Could not load order history." });
  }
};

exports.saveKycConsent = async (req, res) => {
  try {
    if (req.body.accepted !== true || req.body.noticeVersion !== "kyc-notice-v1") {
      return res.status(400).json({ message: "A valid affirmative KYC consent is required." });
    }
    const profile = await getOrCreateProfile(currentUserId(req));
    profile.kycConsent = {
      isActive: true,
      acceptedAt: new Date(),
      withdrawnAt: null,
      noticeVersion: "kyc-notice-v1",
      purposes: KYC_PURPOSES,
      method: "explicit-checkbox",
    };
    await profile.save();
    res.json({ message: "KYC consent saved.", consent: profile.kycConsent });
  } catch (_) {
    res.status(500).json({ message: "Could not save your consent." });
  }
};

exports.withdrawKycConsent = async (req, res) => {
  try {
    const profile = await BusinessProfile.findOne({ userId: currentUserId(req) });
    if (!profile) return res.status(404).json({ message: "Profile not found." });
    if (!profile.kycConsent) profile.kycConsent = {};
    profile.kycConsent.isActive = false;
    profile.kycConsent.withdrawnAt = new Date();
    await profile.save();
    res.json({
      message: "KYC consent withdrawn. New uploads are disabled; previously collected documents follow the published retention policy and applicable legal obligations.",
      consent: profile.kycConsent,
    });
  } catch (_) {
    res.status(500).json({ message: "Could not withdraw consent." });
  }
};

exports.getKycDocuments = async (req, res) => {
  try {
    const [documents, profile] = await Promise.all([
      KycDocument.find({ userId: currentUserId(req) })
        .sort({ createdAt: -1 })
        .select("type originalName mimeType size status rejectionReason reviewNote issueDate issueDateConfidence ocrCompletedAt reviewedAt isCurrent maskedIdentifier registryCheck qualityCheck classification fieldPresence reviewHistory createdAt updatedAt")
        .lean(),
      BusinessProfile.findOne({ userId: currentUserId(req) }).select("kycConsent").lean(),
    ]);
    res.json({ documents: documents.map(safeKycDocument), consent: profile?.kycConsent || null });
  } catch (_) {
    res.status(500).json({ message: "Could not load KYC documents." });
  }
};

exports.uploadKycDocument = async (req, res) => {
  let uploadedFileId;
  try {
    const userId = currentUserId(req);
    const { type } = req.params;
    if (!KYC_TYPES.has(type)) return res.status(400).json({ message: "Unknown KYC document type." });
    if (!req.file) return res.status(400).json({ message: "Choose a document to upload." });

    const profile = await BusinessProfile.findOne({ userId });
    if (!profile?.kycConsent?.isActive || !profile.kycConsent.acceptedAt) {
      return res.status(403).json({ message: "Please read the KYC privacy notice and give consent before uploading." });
    }

    const detectedMime = detectImageMime(req.file.buffer);
    if (!detectedMime || detectedMime !== req.file.mimetype) {
      return res.status(400).json({ message: "The file content does not match an accepted image format." });
    }

    // Quality inspection and OCR run in memory. The original OCR text and extracted
    // identifiers are never logged or persisted in plaintext.
    const quality = await inspectDocumentImage(req.file.buffer);
    if (quality.needsReupload) {
      return res.status(422).json({
        message: quality.result.issues.join(" "),
        qualityCheck: quality.result,
      });
    }

    let ocrText = "";
    let ocrConfidence = 0;
    try {
      const ocrResult = await runOcr(quality.ocrBuffer);
      ocrText = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
    } catch (_) {
      ocrText = "";
      ocrConfidence = 0;
    }

    const classification = classifyDocument(ocrText, type);
    if (classification.outcome === "mismatch") {
      return res.status(422).json({
        message: classification.note,
        classification: {
          expectedType: classification.expectedType,
          detectedType: classification.detectedType,
          confidence: classification.confidence,
          outcome: classification.outcome,
        },
      });
    }

    const extracted = extractKycFields(ocrText, type);
    let status = "pending";
    let reviewNote = ocrText
      ? "OCR completed. Final document and verification review is pending."
      : "OCR could not read this image reliably. Manual review is required.";
    let rejectionReason = "";
    let maskedIdentifier = "";
    let identifierFingerprint = "";
    let registryCheck;
    let issueDate = type === "addressProof" ? extracted.issueDate : null;

    if (classification.outcome === "uncertain") {
      reviewNote = classification.note;
    }

    if (type === "addressProof") {
      const dateCheck = validateAddressProofDate(issueDate);
      status = dateCheck.status;
      if (status === "rejected") rejectionReason = dateCheck.reason;
      else reviewNote = dateCheck.reason;
    } else if (type === "gstCertificate" && extracted.gstin) {
      const result = await verifyGstin({
        gstin: extracted.gstin,
        businessName: extracted.businessName,
        tradeName: extracted.tradeName,
        state: extracted.state,
        confidence: ocrConfidence,
      });
      status = result.status;
      reviewNote = result.reviewNote || "";
      rejectionReason = result.rejectionReason || "";
      maskedIdentifier = result.maskedIdentifier || "";
      identifierFingerprint = result.identifierFingerprint || "";
      registryCheck = result.registryCheck;
    } else if (type === "gstCertificate") {
      registryCheck = {
        registry: "mock-gstin-registry",
        outcome: "identifier-not-extracted",
        registrationStatus: "",
        checkedAt: new Date(),
        nameMatch: false,
        stateMatch: false,
        activityMatch: null,
        note: "OCR could not reliably extract a GSTIN. No registry lookup was performed; manual review is required.",
      };
      reviewNote = registryCheck.note;
    } else if (type === "udyamCertificate" && extracted.udyamNumber) {
   const result = await verifyUdyam({
  udyamNumber: extracted.udyamNumber,
  businessName: extracted.businessName,
  state: extracted.state,
  majorActivity: extracted.majorActivity,
  enterpriseType: extracted.enterpriseType,
  city: extracted.city,
  confidence: ocrConfidence,
});
      status = result.status;
      reviewNote = result.reviewNote || "";
      rejectionReason = result.rejectionReason || "";
      maskedIdentifier = result.maskedIdentifier || "";
      identifierFingerprint = result.identifierFingerprint || "";
      registryCheck = result.registryCheck;
    } else if (type === "udyamCertificate") {
      registryCheck = {
        registry: "mock-udyam-registry",
        outcome: "identifier-not-extracted",
        registrationStatus: "",
        checkedAt: new Date(),
        nameMatch: false,
        stateMatch: false,
        activityMatch: null,
        note: "OCR could not reliably extract a Udyam number. No registry lookup was performed; manual review is required.",
      };
      reviewNote = registryCheck.note;
    } else if (type === "signatoryId") {
      reviewNote = "Image quality and document type checks completed. An authorised reviewer must verify the signatory document.";
    }

    if (classification.outcome === "uncertain") {
      status = "pending";
      rejectionReason = "";
    }
    if (quality.result.status === "review" && !quality.result.deskewed) {
      status = "pending";
      rejectionReason = "";
      reviewNote = [reviewNote, ...quality.result.warnings].filter(Boolean).join(" ");
    }

    const encryptedFile = encryptBuffer(req.file.buffer);
    const extension = detectedMime === "image/jpeg" ? "jpg" : detectedMime === "image/png" ? "png" : "webp";
    const safeName = `kyc-${type}-${Date.now()}.${extension}`;
    const uploadStream = getBucket().openUploadStream(safeName, {
      contentType: detectedMime,
      metadata: {
        userId: String(userId),
        type,
        encryption: encryptedFile.encryption,
      },
    });
    uploadedFileId = uploadStream.id;
    await new Promise((resolve, reject) => {
      uploadStream.once("finish", resolve);
      uploadStream.once("error", reject);
      uploadStream.end(encryptedFile.buffer);
    });

    const decisionReason = status === "rejected" ? rejectionReason : reviewNote;
    const document = await KycDocument.create({
      userId,
      type,
      fileId: uploadedFileId,
      originalName: safeName,
      mimeType: detectedMime,
      size: req.file.size,
      status,
      rejectionReason,
      reviewNote,
      issueDate,
      issueDateConfidence: issueDate ? "detected" : type === "addressProof" ? "manual-review" : "not-detected",
      ocrCompletedAt: ocrText ? new Date() : null,
      maskedIdentifier,
      identifierFingerprint,
      registryCheck,
      qualityCheck: { ...quality.result, checkedAt: new Date() },
      classification: { ...classification, checkedAt: new Date() },
      fieldPresence: extracted.fieldPresence,
      verificationSource: registryCheck ? "mock-registry" : type === "addressProof" ? "ocr-date-check" : "manual-review",
      reviewHistory: [{ status, reason: decisionReason || "Automated checks completed; human review may still be required.", reviewedAt: new Date() }],
      isCurrent: true,
    });

    await KycDocument.updateMany(
      { userId, type, _id: { $ne: document._id }, isCurrent: true },
      { $set: { isCurrent: false, replacedAt: new Date() } }
    );

    res.status(201).json({
      message: status === "rejected"
        ? rejectionReason
        : status === "accepted"
          ? "Document passed the available automated checks against the supplied mock registry."
          : "Document uploaded. Further review is required.",
      document: safeKycDocument(document),
    });
  } catch (_) {
    if (uploadedFileId && mongoose.connection.db) {
      try { await getBucket().delete(uploadedFileId); } catch (_) { /* best-effort cleanup */ }
    }
    res.status(500).json({ message: "Document upload or verification failed. Please try again or request manual review." });
  }
};

exports.getKycFile = async (req, res) => {
  try {
    const document = await KycDocument.findOne({
      _id: req.params.documentId,
      userId: currentUserId(req),
    });
    if (!document) return res.status(404).json({ message: "Document not found." });

    const fileRecord = await mongoose.connection.db
      .collection("kycFiles.files")
      .findOne({ _id: document.fileId });
    if (!fileRecord) return res.status(404).json({ message: "Stored document not found." });

    const encryptedBuffer = await collectStream(getBucket().openDownloadStream(document.fileId));
    const plainBuffer = decryptBuffer(encryptedBuffer, fileRecord.metadata?.encryption);

    res.set("Content-Type", document.mimeType);
    res.set("Content-Length", String(plainBuffer.length));
    res.set("Content-Disposition", `inline; filename="${document.originalName.replace(/["\\]/g, "")}"`);
    res.set("Cache-Control", "private, no-store, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(plainBuffer);
  } catch (_) {
    res.status(500).json({ message: "Could not open this document. Contact support if the problem continues." });
  }
};

exports.reviewKycDocument = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Reviewer access is required." });
    }

    const { status, rejectionReason = "" } = req.body;
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be accepted or rejected." });
    }
    const safeReason = String(rejectionReason).trim().slice(0, 1000);
    if (status === "rejected" && !safeReason) {
      return res.status(400).json({ message: "Provide a reason when rejecting a document." });
    }

    const document = await KycDocument.findById(req.params.documentId);
    if (!document) return res.status(404).json({ message: "Document not found." });

    const finalReason = status === "rejected" ? safeReason : "Approved by an authorised reviewer.";
    document.status = status;
    document.rejectionReason = status === "rejected" ? safeReason : "";
    document.reviewNote = "";
    document.reviewerId = currentUserId(req);
    document.reviewedAt = new Date();
    document.reviewHistory.push({
      status,
      reason: finalReason,
      reviewerId: currentUserId(req),
      reviewedAt: new Date(),
    });
    await document.save();

    res.json({
      message: "KYC review saved.",
      document: safeKycDocument(document),
    });
  } catch (_) {
    res.status(500).json({ message: "Could not update KYC status." });
  }
};
