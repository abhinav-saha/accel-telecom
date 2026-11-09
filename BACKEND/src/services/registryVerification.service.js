const GSTINRegistry = require("../models/gstinRegistry.model");
const UdyamRegistry = require("../models/udyamRegistry.model");
const { fingerprintIdentifier, maskIdentifier } = require("./kycCrypto.service");

// The synthetic GSTIN data intentionally permits X in the 4th PAN character.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const UDYAM_PATTERN = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;

function normalizeIdentifier(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .toUpperCase()
    .replace(/\b(M\/S|M S|MESSRS)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(leftValue, rightValue) {
  const left = normalizeName(leftValue);
  const right = normalizeName(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let common = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) common += 1;
  return (2 * common) / (leftTokens.size + rightTokens.size);
}

function namesMatch(extractedNames, registryNames) {
  const extracted = (Array.isArray(extractedNames) ? extractedNames : [extractedNames])
    .map(normalizeName)
    .filter(Boolean);
  const candidates = (registryNames || []).map(normalizeName).filter(Boolean);
  if (!extracted.length || !candidates.length) return false;
  return extracted.some((left) => candidates.some((right) => nameSimilarity(left, right) >= 0.78));
}

function normalizeState(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "").trim();
}

function statesMatch(extractedState, registryState) {
  if (!extractedState || !registryState) return false;
  return normalizeState(extractedState) === normalizeState(registryState);
}

function normalizeActivity(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!normalized) return "";
  if (["SERVICE", "SERVICES", "SERVICEACTIVITY"].includes(normalized)) return "SERVICES";
  if (["TRADE", "TRADING", "TRADER", "TRADERS"].includes(normalized)) return "TRADING";
  if (["MANUFACTURING", "MANUFACTURE", "MANUFACTURER"].includes(normalized)) return "MANUFACTURING";
  return normalized;
}

function activitiesMatch(extractedActivity, registryActivity) {
  if (!extractedActivity || !registryActivity) return null;
  return normalizeActivity(extractedActivity) === normalizeActivity(registryActivity);
}

function normalizeEnterpriseType(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!normalized) return "";
  if (normalized.includes("MICRO")) return "MICRO";
  if (normalized.includes("SMALL")) return "SMALL";
  if (normalized.includes("MEDIUM")) return "MEDIUM";
  return normalized;
}

function enterpriseTypesMatch(extractedType, registryType) {
  if (!extractedType || !registryType) return null;
  return normalizeEnterpriseType(extractedType) === normalizeEnterpriseType(registryType);
}

function normalizeCity(value) {
  return normalizeName(value).replace(/\b(DISTRICT|DIST|CITY)\b/g, "").replace(/\s+/g, " ").trim();
}

function citiesMatch(extractedCity, registryCity) {
  if (!extractedCity || !registryCity) return null;
  return normalizeCity(extractedCity) === normalizeCity(registryCity);
}

function resultBase(type, identifier) {
  return {
    maskedIdentifier: maskIdentifier(identifier),
    identifierFingerprint: fingerprintIdentifier(type, identifier),
    registryCheck: {
      registry: type === "gstin" ? "mock-gstin-registry" : "mock-udyam-registry",
      outcome: "manual-review",
      registrationStatus: "",
      checkedAt: new Date(),
      nameMatch: false,
      stateMatch: false,
      activityMatch: null,
      enterpriseTypeMatch: null,
      cityMatch: null,
      note: "Verification requires manual review.",
    },
  };
}

function pendingResult(base, outcome, note, extra = {}) {
  return {
    status: "pending",
    reviewNote: note,
    rejectionReason: "",
    ...base,
    registryCheck: { ...base.registryCheck, outcome, note, ...extra },
  };
}

function invalidIdentifierResult(type, normalized) {
  return {
    status: "pending",
    reviewNote: `OCR did not produce a clearly valid ${type === "gstin" ? "GSTIN" : "Udyam registration number"}. A reviewer must inspect the document.`,
    rejectionReason: "",
    maskedIdentifier: normalized ? maskIdentifier(normalized) : "",
    identifierFingerprint: "",
    registryCheck: {
      registry: type === "gstin" ? "mock-gstin-registry" : "mock-udyam-registry",
      outcome: "invalid-or-unreadable",
      registrationStatus: "",
      checkedAt: new Date(),
      nameMatch: false,
      stateMatch: false,
      activityMatch: null,
      enterpriseTypeMatch: null,
      cityMatch: null,
      note: "No registry lookup was performed because the extracted identifier format was not reliable.",
    },
  };
}

async function verifyGstin({ gstin, businessName, tradeName, state, confidence }) {
  const normalized = normalizeIdentifier(gstin);
  if (!GSTIN_PATTERN.test(normalized)) return invalidIdentifierResult("gstin", normalized);

  const base = resultBase("gstin", normalized);
  if (Number(confidence) < 45) {
    return pendingResult(base, "low-ocr-confidence", "OCR confidence was too low for automatic verification. A reviewer must inspect the document.");
  }

  const record = await GSTINRegistry.findOne({ gstin: normalized })
    .select("legalName tradeName state status")
    .lean();

  if (!record) {
    return pendingResult(base, "not-found", "This GSTIN was not found in the supplied mock registry. Recheck the certificate or request manual review.");
  }

  const nameMatch = namesMatch([businessName, tradeName], [record.legalName, record.tradeName]);
  const stateMatch = statesMatch(state, record.state);
  const check = { ...base.registryCheck, registrationStatus: record.status, checkedAt: new Date(), nameMatch, stateMatch };

  if (record.status === "Cancelled") {
    const note = "The GSTIN exists in the mock registry, but its registration status is Cancelled.";
    return { status: "rejected", rejectionReason: note, reviewNote: "", ...base, registryCheck: { ...check, outcome: "cancelled", note } };
  }

  if (record.status === "Suspended") {
    const note = "The GSTIN exists but its registration status is Suspended. Automatic approval is on hold pending manual review.";
    return { status: "pending", rejectionReason: "", reviewNote: note, ...base, registryCheck: { ...check, outcome: "suspended", note } };
  }

  if (record.status !== "Active") {
    return pendingResult({ ...base, registryCheck: check }, "unknown-registration-status", "The registry returned an unrecognised GSTIN status. Manual review is required.");
  }

  if ((!businessName && !tradeName) || !state) {
    const missing = [(!businessName && !tradeName) ? "business name" : "", !state ? "state" : ""].filter(Boolean).join(" and ");
    const note = `GSTIN is Active, but OCR could not reliably extract the ${missing}. Manual comparison is required.`;
    return pendingResult({ ...base, registryCheck: check }, "insufficient-document-fields", note);
  }

  if (!nameMatch || !stateMatch) {
    const fields = [!nameMatch ? "business name" : "", !stateMatch ? "state" : ""].filter(Boolean).join(" and ");
    const note = `GSTIN is Active, but the ${fields} could not be matched confidently. Manual review is required.`;
    return pendingResult({ ...base, registryCheck: check }, "detail-mismatch", note);
  }

  const note = "GSTIN is Active and the extracted business name and state match the mock registry.";
  return { status: "accepted", rejectionReason: "", reviewNote: "", ...base, registryCheck: { ...check, outcome: "verified", note } };
}

async function verifyUdyam({
  udyamNumber,
  businessName,
  state,
  majorActivity,
  enterpriseType,
  city,
  district,
  confidence,
}) {
  const normalized = normalizeIdentifier(udyamNumber);
  if (!UDYAM_PATTERN.test(normalized)) return invalidIdentifierResult("udyam", normalized);

  const base = resultBase("udyam", normalized);
  if (Number(confidence) < 45) {
    return pendingResult(base, "low-ocr-confidence", "OCR confidence was too low for automatic verification. A reviewer must inspect the document.");
  }

  const record = await UdyamRegistry.findOne({ udyamNumber: normalized })
    .select("enterpriseName state enterpriseType majorActivity city")
    .lean();

  if (!record) {
    return pendingResult(base, "not-found", "This Udyam number was not found in the supplied mock registry. Recheck the certificate or request manual review.");
  }

  const nameMatch = namesMatch(businessName, [record.enterpriseName]);
  const stateMatch = statesMatch(state, record.state);
  const activityMatch = activitiesMatch(majorActivity, record.majorActivity);
  const typeMatch = enterpriseTypesMatch(enterpriseType, record.enterpriseType);
  const locationValue = city || district;
  const cityMatch = citiesMatch(locationValue, record.city);

  const check = {
    ...base.registryCheck,
    checkedAt: new Date(),
    nameMatch,
    stateMatch,
    activityMatch,
    enterpriseTypeMatch: typeMatch,
    cityMatch,
  };

  // Udyam number + enterprise name + state are the core comparison fields.
  // Activity, enterprise type and city are compared when OCR extracts them,
  // but their absence alone does not force manual review.
  if (!businessName || !state) {
    const missing = [!businessName ? "enterprise name" : "", !state ? "state" : ""].filter(Boolean).join(" and ");
    const note = `The Udyam number exists, but OCR could not reliably extract the ${missing}. Manual review is required.`;
    return pendingResult({ ...base, registryCheck: check }, "insufficient-document-fields", note);
  }

  if (!nameMatch || !stateMatch || activityMatch === false || typeMatch === false || cityMatch === false) {
    const fields = [
      !nameMatch ? "enterprise name" : "",
      !stateMatch ? "state" : "",
      activityMatch === false ? "major activity" : "",
      typeMatch === false ? "enterprise type" : "",
      cityMatch === false ? (city ? "city" : "district/city") : "",
    ].filter(Boolean).join(", ");
    const note = `The Udyam registration exists, but ${fields} differ from the supplied mock registry. Manual review is required.`;
    return pendingResult({ ...base, registryCheck: check }, "detail-mismatch", note);
  }

  const comparedFields = [
    "Udyam number", "enterprise name", "state",
    ...(activityMatch === null ? [] : ["major activity"]),
    ...(typeMatch === null ? [] : ["enterprise type"]),
    ...(cityMatch === null ? [] : ["city/district"]),
  ];
  const note = `${comparedFields.join(", ")} matched the supplied mock registry. Missing optional fields were not used for automatic comparison.`;
  return {
    status: "accepted",
    rejectionReason: "",
    reviewNote: "",
    ...base,
    registryCheck: { ...check, outcome: "verified", note },
  };
}

module.exports = {
  GSTIN_PATTERN,
  UDYAM_PATTERN,
  normalizeIdentifier,
  normalizeName,
  nameSimilarity,
  namesMatch,
  verifyGstin,
  verifyUdyam,
};
