const Tesseract = require("tesseract.js");

function parseDate(value) {
  if (!value) return null;
  const cleaned = value.replace(/[.]/g, "/").trim();
  let match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    if (date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1])) return date;
  }
  match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])) return date;
  }
  return null;
}

function findIssueDate(text) {
  // Deliberately look near an issue-date label; do not mistake a DOB or bill-period date for issue date.
  const match = text.match(/(?:date\s+of\s+issue|issue\s+date|issued\s+on|date\s+issued|document\s+date)\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i);
  return match ? parseDate(match[1]) : null;
}

async function runOcr(buffer) {
  const result = await Tesseract.recognize(buffer, "eng");
  return String(result?.data?.text || "");
}

function validateAddressProofDate(issueDate) {
  if (!issueDate) return { status: "pending", reason: "OCR could not confidently identify the document issue date. A reviewer must confirm that it is no older than 90 days." };
  // Set KYC_REFERENCE_DATE=2026-07-15 only when replaying the synthetic hackathon dataset.
  const now = process.env.KYC_REFERENCE_DATE ? new Date(`${process.env.KYC_REFERENCE_DATE}T23:59:59`) : new Date();
  const ageInDays = Math.floor((now.getTime() - issueDate.getTime()) / 86400000);
  if (ageInDays < 0) return { status: "rejected", reason: "The detected issue date is in the future. Upload a valid, current address proof." };
  if (ageInDays > 90) return { status: "rejected", reason: "This address proof is older than 90 days. Please upload a document issued within the last 90 days." };
  return { status: "pending", reason: "The detected issue date is within 90 days. Final verification is pending." };
}

module.exports = { runOcr, findIssueDate, validateAddressProofDate };
