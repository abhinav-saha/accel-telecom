const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const UDYAM_PATTERN = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;

const TYPE_LABELS = {
  addressProof: "Address proof",
  gstCertificate: "GST registration certificate",
  udyamCertificate: "Udyam registration certificate",
  signatoryId: "Authorised signatory ID",
};

function normalizeText(text) {
  return String(text || "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreDocumentTypes(text) {
  const normalized = normalizeText(text);
  const scores = {
    addressProof: 0,
    gstCertificate: 0,
    udyamCertificate: 0,
    signatoryId: 0,
  };

  const has = (pattern) => pattern.test(normalized);

  if (has(/ELECTRICITY BILL|WATER BILL|TELEPHONE BILL|UTILITY BILL|BANK STATEMENT|RENT AGREEMENT|SUPPLY ADDRESS|BILLED TO|CONSUMER NO|BILL DATE/)) scores.addressProof += 3;
  if (has(/ADDRESS PROOF|PROOF OF ADDRESS|SERVICE ADDRESS/)) scores.addressProof += 2;

  if (has(/GST REGISTRATION CERTIFICATE|GOODS AND SERVICES TAX|GSTIN/)) scores.gstCertificate += 3;
  if (GSTIN_PATTERN.test(normalized.replace(/\s/g, ""))) scores.gstCertificate += 3;
  if (has(/LEGAL NAME|TRADE NAME|TYPE OF REGISTRATION/)) scores.gstCertificate += 1;

  if (has(/UDYAM REGISTRATION CERTIFICATE|UDYAM REGISTRATION|MSME/)) scores.udyamCertificate += 3;
  if (UDYAM_PATTERN.test(normalized.replace(/\s/g, ""))) scores.udyamCertificate += 3;
  if (has(/ENTERPRISE NAME|MAJOR ACTIVITY|DATE OF REGISTRATION/)) scores.udyamCertificate += 1;

  if (has(/AUTHORISED SIGNATORY ID|IDENTITY CARD|AADHAAR|PASSPORT|DRIVING LICENCE|DRIVING LICENSE|VOTER ID|PAN CARD/)) scores.signatoryId += 3;
  if (has(/DATE OF BIRTH|ID NO|IDENTIFICATION NUMBER|VALID TILL/)) scores.signatoryId += 1;

  return scores;
}

function classifyDocument(text, expectedType) {
  const scores = scoreDocumentTypes(text);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [detectedType, winningScore] = ranked[0] || ["unknown", 0];
  const expectedScore = scores[expectedType] || 0;
  const secondScore = ranked[1]?.[1] || 0;
  const totalEvidence = Object.values(scores).reduce((sum, value) => sum + value, 0);

  if (!String(text || "").trim() || winningScore < 3) {
    return {
      expectedType,
      detectedType: "unknown",
      confidence: 0,
      outcome: "uncertain",
      matchesExpectedType: null,
      note: "The document type could not be identified confidently from the extracted text. Manual review is required.",
      evidenceScore: expectedScore,
    };
  }

  const confidence = Math.min(0.99, winningScore / (winningScore + secondScore + 1));
  const isClearWinner = winningScore >= 3 && winningScore - secondScore >= 2;

  if (detectedType === expectedType && isClearWinner) {
    return {
      expectedType,
      detectedType,
      confidence: Number(confidence.toFixed(2)),
      outcome: "matched",
      matchesExpectedType: true,
      note: `${TYPE_LABELS[expectedType]} type indicators were found.`,
      evidenceScore: expectedScore,
    };
  }

  if (detectedType !== expectedType && isClearWinner) {
    return {
      expectedType,
      detectedType,
      confidence: Number(confidence.toFixed(2)),
      outcome: "mismatch",
      matchesExpectedType: false,
      note: `This upload appears to be ${TYPE_LABELS[detectedType] || "a different document"}, not ${TYPE_LABELS[expectedType] || "the requested document"}. Please upload the correct document.`,
      evidenceScore: expectedScore,
    };
  }

  return {
    expectedType,
    detectedType,
    confidence: Number(confidence.toFixed(2)),
    outcome: "uncertain",
    matchesExpectedType: null,
    note: "The document type is ambiguous. A reviewer must confirm it before verification.",
    evidenceScore: expectedScore,
  };
}

module.exports = { classifyDocument, scoreDocumentTypes };
