require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { inspectDocumentImage } = require("../services/documentQuality.service");
const { runOcr, extractKycFields, validateAddressProofDate } = require("../services/kycOcr.service");
const { classifyDocument } = require("../services/documentClassification.service");
const { verifyGstin, verifyUdyam } = require("../services/registryVerification.service");

const DOC_TYPES = [
  ["gst_certificate", "gstCertificate", "GST"],
  ["udyam_certificate", "udyamCertificate", "Udyam"],
  ["address_proof", "addressProof", "Address"],
  ["signatory_id", "signatoryId", "Signatory ID"],
];

function typeForFilename(filename) {
  return DOC_TYPES.find(([suffix]) => filename.toLowerCase().includes(`_${suffix}.`));
}

function safeOutcome(documentType, fields, result) {
  if (documentType === "gstCertificate") {
    if (!fields.gstin) return "MANUAL_REVIEW_IDENTIFIER_NOT_READ";
    return `GST_${result.status.toUpperCase()}_${result.registryCheck?.outcome || "CHECKED"}`;
  }
  if (documentType === "udyamCertificate") {
    if (!fields.udyamNumber) return "MANUAL_REVIEW_IDENTIFIER_NOT_READ";
    return `UDYAM_${result.status.toUpperCase()}_${result.registryCheck?.outcome || "CHECKED"}`;
  }
  return result;
}

async function inspectOne(filePath, applicantId, documentType, shortName) {
  const filename = path.basename(filePath);
  try {
    const buffer = fs.readFileSync(filePath);
    const quality = await inspectDocumentImage(buffer);

    if (quality.needsReupload) {
      return { applicantId, shortName, result: "REUPLOAD_REQUIRED", detail: quality.result.issues.join(" ") };
    }

    const ocr = await runOcr(quality.ocrBuffer);
    const classification = classifyDocument(ocr.text, documentType);

    if (classification.outcome === "mismatch") {
      return { applicantId, shortName, result: "WRONG_DOCUMENT_TYPE", detail: classification.note };
    }

    const fields = extractKycFields(ocr.text, documentType);
    if (classification.outcome === "uncertain") {
      return { applicantId, shortName, result: "MANUAL_REVIEW_DOCUMENT_TYPE", detail: classification.note };
    }

    if (documentType === "gstCertificate") {
      if (!fields.gstin) return { applicantId, shortName, result: "MANUAL_REVIEW_GSTIN_NOT_READ", detail: "GSTIN was not extracted confidently." };
      const result = await verifyGstin({
        gstin: fields.gstin,
        businessName: fields.businessName,
        tradeName: fields.tradeName,
        state: fields.state,
        confidence: ocr.confidence,
      });
      return { applicantId, shortName, result: safeOutcome(documentType, fields, result), detail: result.rejectionReason || result.reviewNote || result.registryCheck?.note || "" };
    }

    if (documentType === "udyamCertificate") {
      if (!fields.udyamNumber) return { applicantId, shortName, result: "MANUAL_REVIEW_UDYAM_NUMBER_NOT_READ", detail: "Udyam registration number was not extracted confidently." };
      const result = await verifyUdyam({
        udyamNumber: fields.udyamNumber,
        businessName: fields.businessName,
        state: fields.state,
        majorActivity: fields.majorActivity,
        confidence: ocr.confidence,
      });
      return { applicantId, shortName, result: safeOutcome(documentType, fields, result), detail: result.rejectionReason || result.reviewNote || result.registryCheck?.note || "" };
    }

    if (documentType === "addressProof") {
      const dateCheck = validateAddressProofDate(fields.issueDate);
      return {
        applicantId,
        shortName,
        result: dateCheck.status === "rejected" ? "ADDRESS_PROOF_TOO_OLD" : dateCheck.status === "pending" ? "ADDRESS_PROOF_REVIEW" : "ADDRESS_PROOF_CHECKED",
        detail: dateCheck.reason,
      };
    }

    return {
      applicantId,
      shortName,
      result: "SIGNATORY_ID_MANUAL_REVIEW",
      detail: "Image quality and type indicators were checked. Identity details are not extracted by this privacy-minimised test.",
    };
  } catch (_) {
    // Do not print OCR text, identifiers, names, or raw parser errors.
    return { applicantId, shortName, result: "PROCESSING_ERROR", detail: "Could not process this specimen; inspect it manually." };
  }
}

async function main() {
  const directory = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "../../data/kyc_documents");

  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error("Pass the path to the extracted kyc_documents folder as the first argument.");
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing from BACKEND/.env.");
  if (!process.env.KYC_DATA_ENCRYPTION_KEY || !process.env.KYC_LOOKUP_HMAC_KEY) {
    throw new Error("KYC encryption and HMAC keys must be configured in BACKEND/.env.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const rows = [];
  const files = fs.readdirSync(directory).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
  const applicantIds = Array.from({ length: 12 }, (_, index) => `K${String(index + 1).padStart(2, "0")}`);

  for (const applicantId of applicantIds) {
    for (const [suffix, type, shortName] of DOC_TYPES) {
      const filename = `${applicantId}_${suffix}.png`;
      const fullPath = path.join(directory, filename);
      if (!fs.existsSync(fullPath)) {
        rows.push({ applicantId, shortName, result: "MISSING_DOCUMENT", detail: "No file was supplied for this document type." });
        continue;
      }
      rows.push(await inspectOne(fullPath, applicantId, type, shortName));
    }
  }

  console.log("\nKYC SPECIMEN TEST MATRIX");
  console.log("Applicant | Document | Result | Explanation");
  console.log("-".repeat(100));
  for (const row of rows) {
    console.log(`${row.applicantId} | ${row.shortName} | ${row.result} | ${row.detail}`);
  }

  const summary = rows.reduce((counts, row) => {
    counts[row.result] = (counts[row.result] || 0) + 1;
    return counts;
  }, {});
  console.log("\nSUMMARY");
  console.log("Files present:", files.length);
  console.log("Expected applicant/document slots:", applicantIds.length * DOC_TYPES.length);
  console.log("Results:", summary);
  console.log("\nNo extracted identifiers, names, OCR text or document bytes were printed or saved by this script.");
}

main()
  .catch(() => {
    console.error("KYC specimen test failed. Check the folder path, MongoDB connection and environment configuration.");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
