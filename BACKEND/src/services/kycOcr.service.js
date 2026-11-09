const Tesseract = require("tesseract.js");

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Puducherry",
  "Jammu and Kashmir", "Ladakh", "Chandigarh", "Andaman and Nicobar Islands",
  "Lakshadweep", "Dadra and Nagar Haveli and Daman and Diu",
];

const GST_STATE_CODES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
  "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

function parseDate(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[.]/g, "/").trim();
  let match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (match) {
    // Indian documents conventionally use DD/MM/YYYY.
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date;
  }

  match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date;
  }
  return null;
}

async function runOcr(buffer) {
  const result = await Tesseract.recognize(buffer, "eng", {
    logger: () => {},
    // Sparse text layouts are common in certificates and identity documents.
    // Tesseract still returns its normal confidence and text output.
    ...(Tesseract.PSM ? { psm: Tesseract.PSM.AUTO } : {}),
  });

  return {
    text: String(result?.data?.text || ""),
    confidence: Number(result?.data?.confidence || 0),
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanExtractedValue(value, maxLength) {
  return String(value || "")
    .replace(/[|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, "")
    .trim()
    .slice(0, maxLength);
}

function extractLabeledValue(text, labels, maxLength = 180) {
  const lines = String(text || "")
    .replace(/\u00A0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sortedLabels = [...labels].sort((a, b) => b.length - a.length);
  const alternatives = sortedLabels.map(escapeRegex).join("|");
  const labelPattern = new RegExp(`(?:^|\\b)(?:${alternatives})\\b\\s*[:.\\-]?\\s*(.*)$`, "i");
  const anyKnownLabel = new RegExp(`\\b(?:${alternatives})\\b\\s*[:.\\-]?`, "i");

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(labelPattern);
    if (!match) continue;

    let value = cleanExtractedValue(match[1], maxLength);

    // Some scans place the value on the next line instead of beside the label.
    if (!value && lines[index + 1]) {
      const nextLine = lines[index + 1];
      if (!anyKnownLabel.test(nextLine)) value = cleanExtractedValue(nextLine, maxLength);
    }

    // If another known label appears later on the same line, keep only the
    // text before it instead of accidentally merging two fields.
    const nextLabelMatch = value.match(new RegExp(`\\s+\\b(?:${alternatives})\\b\\s*[:.\\-]`, "i"));
    if (nextLabelMatch) value = value.slice(0, nextLabelMatch.index).trim();

    if (value.length >= 2 && value.length <= maxLength) return value;
  }
  return "";
}

function extractGstin(text) {
  const compact = String(text || "").toUpperCase().replace(/[\s\u00A0]/g, "");
  const match = compact.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]/);
  return match ? match[0] : "";
}

function extractUdyamNumber(text) {
  const compact = String(text || "").toUpperCase().replace(/[\s\u00A0]/g, "");
  const match = compact.match(/UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}/);
  return match ? match[0] : "";
}

function editDistance(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (Math.abs(a.length - b.length) > 1) return 2;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function normalizeStateText(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "");
}

function extractState(text, gstin = "") {
  const source = String(text || "");
  const explicit = extractLabeledValue(source, ["state / ut", "state/ut", "state"], 80);
  const searchable = [explicit, source].filter(Boolean).join(" ");
  const compactText = normalizeStateText(searchable);

  const exact = INDIAN_STATES.find((state) => compactText.includes(normalizeStateText(state)));
  if (exact) return exact;

  // Fuzzy matching is limited to the explicitly labelled state value.
  if (explicit) {
    const candidate = normalizeStateText(explicit);
    for (const state of INDIAN_STATES) {
      const target = normalizeStateText(state);
      if (editDistance(candidate, target) <= 1) return state;
    }
  }

  // GSTIN's first two characters encode the state code. This is an inferred
  // value and is separately identified through stateSource.
  const normalizedGstin = String(gstin || extractGstin(source));
  return GST_STATE_CODES[normalizedGstin.slice(0, 2)] || "";
}

function extractIssueDate(text) {
  const source = String(text || "").replace(/\u00A0/g, " ");
  const datePattern = /(\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{4}|\d{4}\s*-\s*\d{1,2}\s*-\s*\d{1,2})/;
  const labelPattern = /(?:date\s+of\s+issue|issue\s+date|issued\s+on|date\s+issued|document\s+date|bill\s+date|statement\s+date)\s*[:.\-]?/i;
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const labelMatch = lines[index].match(labelPattern);
    if (!labelMatch) continue;
    const sameLine = lines[index].slice(labelMatch.index + labelMatch[0].length);
    const dateMatch = sameLine.match(datePattern) || (lines[index + 1] || "").match(datePattern);
    if (dateMatch) {
      const parsed = parseDate(dateMatch[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function findIssueDate(text) {
  return extractIssueDate(text);
}

function extractKycFields(text, type) {
  const fields = {
    gstin: "",
    udyamNumber: "",
    businessName: "",
    tradeName: "",
    state: "",
    majorActivity: "",
    enterpriseType: "",
    city: "",
    district: "",
    stateSource: "not-found",
    issueDate: null,
    fieldPresence: {},
  };

  if (type === "gstCertificate") {
    fields.gstin = extractGstin(text);
    fields.businessName = extractLabeledValue(text, ["legal name of business", "legal name", "name of business"]);
    fields.tradeName = extractLabeledValue(text, ["trade name"]);
    fields.state = extractState(text, fields.gstin);
    const stateInText = INDIAN_STATES.some((state) => normalizeStateText(text).includes(normalizeStateText(state)));
    fields.stateSource = stateInText ? "document-text" : fields.state ? "gstin-state-code" : "not-found";
  } else if (type === "udyamCertificate") {
    fields.udyamNumber = extractUdyamNumber(text);
    fields.businessName = extractLabeledValue(text, ["name of enterprise", "enterprise name", "name of entrepreneur", "name of unit"]);
    fields.majorActivity = extractLabeledValue(text, ["major activity of enterprise", "major activity"], 80);
    fields.enterpriseType = extractLabeledValue(text, ["enterprise type", "type of enterprise", "classification"], 80);
    fields.city = extractLabeledValue(text, ["city"], 80);
    fields.district = extractLabeledValue(text, ["district"], 80);
    fields.state = extractState(text);
    fields.stateSource = fields.state ? "document-text" : "not-found";
  } else if (type === "addressProof") {
    fields.issueDate = extractIssueDate(text);
    fields.businessName = extractLabeledValue(text, ["billed to", "customer name", "account holder", "name"], 160);
  } else if (type === "signatoryId") {
    // Do not extract or persist full Aadhaar/PAN/other ID numbers.
    fields.hasNameLabel = /\bNAME\b/i.test(String(text || ""));
    fields.hasValidityLabel = /\bVALID\s+TILL\b/i.test(String(text || ""));
  }

  fields.fieldPresence = {
    identifier: Boolean(fields.gstin || fields.udyamNumber),
    businessName: Boolean(fields.businessName),
    tradeName: Boolean(fields.tradeName),
    state: Boolean(fields.state),
    majorActivity: Boolean(fields.majorActivity),
    enterpriseType: Boolean(fields.enterpriseType),
    city: Boolean(fields.city),
    district: Boolean(fields.district),
    issueDate: Boolean(fields.issueDate),
    signatoryNameLabel: Boolean(fields.hasNameLabel),
    stateInferredFromGstin: fields.stateSource === "gstin-state-code",
  };

  return fields;
}

function validateAddressProofDate(issueDate) {
  if (!issueDate) {
    return {
      status: "pending",
      reason: "OCR could not confidently identify the bill or issue date. A reviewer must confirm that the address proof is no older than 90 days.",
    };
  }

  const referenceDate = process.env.KYC_REFERENCE_DATE
    ? new Date(`${process.env.KYC_REFERENCE_DATE}T23:59:59.999Z`)
    : new Date();
  if (Number.isNaN(referenceDate.getTime())) {
    return { status: "pending", reason: "The configured KYC reference date is invalid. Manual date review is required." };
  }

  const ageInDays = Math.floor((referenceDate.getTime() - issueDate.getTime()) / 86400000);
  if (ageInDays < 0) {
    return { status: "pending", reason: "The detected issue date is in the future. Manual review is required." };
  }
  if (ageInDays > 90) {
    return { status: "rejected", reason: "This address proof is older than 90 days. Please upload a document issued within the last 90 days." };
  }
  return { status: "pending", reason: "The detected address-proof date is within 90 days. Final address verification is pending." };
}

module.exports = {
  runOcr,
  parseDate,
  findIssueDate,
  extractKycFields,
  validateAddressProofDate,
};
