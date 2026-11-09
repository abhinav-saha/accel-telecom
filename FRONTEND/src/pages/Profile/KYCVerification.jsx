import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { profileApi } from "../../services/profile.api";
import "./KYCVerification.scss";

const DOCS = [
  {
    type: "addressProof",
    title: "Business Address Proof",
    description: "Recent utility bill, bank statement, rent agreement or other accepted address proof.",
    required: "Used to verify the business address. The document date must be within 90 days.",
  },
  {
    type: "gstCertificate",
    title: "GST Registration Certificate",
    description: "Upload the GST registration certificate showing your GSTIN.",
    required: "Required only when a selected product or onboarding rule requires GSTIN.",
  },
  {
    type: "udyamCertificate",
    title: "Udyam Registration Certificate",
    description: "Upload your MSME Udyam registration certificate, if registered.",
    required: "Used to validate MSME registration and applicable product eligibility.",
  },
  {
    type: "signatoryId",
    title: "Authorised Signatory ID",
    description: "Upload an accepted identity document for the person authorised to sign for the business.",
    required: "Used to verify the authorised signatory. Full ID numbers are not extracted for display.",
  },
];

function StatusIcon({ status }) {
  if (status === "accepted") return <CheckCircle2 size={16} />;
  if (status === "rejected") return <XCircle size={16} />;
  return <Clock3 size={16} />;
}

function QualityPanel({ quality }) {
  if (!quality) return null;
  if (quality.status === "good" && !quality.warnings?.length) {
    return (
      <div className="kyc-quality kyc-quality--good">
        <CheckCircle2 size={15} />
        <span>Image quality checks passed.</span>
      </div>
    );
  }

  const messages = [...(quality.warnings || []), ...(quality.issues || [])];
  if (!messages.length) return null;

  return (
    <div className="kyc-quality kyc-quality--warning">
      <AlertTriangle size={15} />
      <div>
        <strong>Image quality notes</strong>
        {messages.map((message, index) => <span key={`${index}-${message}`}>{message}</span>)}
      </div>
    </div>
  );
}

function KYCVerification() {
  const [documents, setDocuments] = useState([]);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consent, setConsent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acceptedNotice, setAcceptedNotice] = useState(false);
  const inputs = useRef({});

  async function load() {
    try {
      setError("");
      const data = await profileApi.getKyc();
      setDocuments(data.documents || []);
      setConsent(data.consent || null);
    } catch (err) {
      setError(err.message || "Could not load KYC information.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const currentDocument = (type) => documents.find((doc) => doc.type === type && doc.isCurrent !== false);

  async function handleUpload(type, file) {
    if (!file) return;

    const hasActiveConsent = Boolean(consent?.isActive && consent?.acceptedAt);
    if (!hasActiveConsent && (!acceptedNotice || !consentAccepted)) {
      setError("Please read the privacy notice and provide consent before uploading KYC documents.");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Upload a JPG, PNG or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Each document must be 5 MB or smaller.");
      return;
    }

    setUploading(type);
    setError("");
    setNotice("");

    try {
      if (!hasActiveConsent) {
        const saved = await profileApi.saveKycConsent({ accepted: true, noticeVersion: "kyc-notice-v1" });
        setConsent(saved.consent);
      }
      const result = await profileApi.uploadKyc(type, file);
      setNotice(result?.message || "Document uploaded. Verification status updated.");
      await load();
    } catch (err) {
      // Server responses intentionally contain a safe explanation, never OCR text or identifiers.
      setError(err.message || "Upload failed. Please try another image.");
    } finally {
      setUploading("");
      if (inputs.current[type]) inputs.current[type].value = "";
    }
  }

  async function viewDocument(doc) {
    setOpening(doc._id);
    setError("");
    try {
      const blob = await profileApi.getKycFile(doc._id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err.message || "Unable to open this document.");
    } finally {
      setOpening("");
    }
  }

  async function withdrawConsent() {
    if (!window.confirm("Withdraw consent for KYC processing? New document uploads will be disabled.")) return;
    try {
      const result = await profileApi.withdrawKycConsent();
      setConsent(result.consent);
      setNotice("KYC consent withdrawn. New uploads are disabled.");
    } catch (err) {
      setError(err.message || "Could not withdraw consent.");
    }
  }

  async function acceptNoticeAndConsent() {
    if (!acceptedNotice || !consentAccepted) {
      setError("Please confirm that you have read the notice and agree to KYC processing.");
      return;
    }
    try {
      setError("");
      const result = await profileApi.saveKycConsent({ accepted: true, noticeVersion: "kyc-notice-v1" });
      setConsent(result.consent);
      setNotice("Your KYC consent preference has been saved.");
    } catch (err) {
      setError(err.message || "Could not save consent.");
    }
  }

  const uploadedCount = DOCS.filter((item) => Boolean(currentDocument(item.type))).length;

  return (
    <div className="kyc-page">
      <header className="profile-section-heading">
        <div>
          <span className="profile-section-heading__eyebrow">IDENTITY & BUSINESS CHECKS</span>
          <h2>KYC Verification</h2>
          <p>Upload and track the documents needed to verify your business.</p>
        </div>
        <button className="profile-icon-button" onClick={load} aria-label="Refresh KYC status">
          <RefreshCw size={17} />
        </button>
      </header>

      <section className="kyc-privacy-notice">
        <div className="kyc-privacy-notice__heading">
          <span><LockKeyhole size={18} /></span>
          <div><h3>Why do we need these documents?</h3><p>Privacy notice · Version 1.0</p></div>
        </div>
        <p>
          We request only the documents needed to verify your business identity and address, confirm the
          authorised signatory, validate GSTIN or Udyam details where relevant, and determine eligibility
          for the products you select. OCR is used to read relevant fields; extracted identifiers are
          masked in this page and are not included in application logs. Original images are encrypted
          before storage. Access is restricted to the account owner and authorised reviewers.
        </p>
        <div className="kyc-privacy-notice__details">
          <div><strong>Information collected</strong><span>Document images and only relevant verification details, such as business name, registration number and issue date.</span></div>
          <div><strong>How it is used</strong><span>Image-quality checks, OCR-assisted extraction, format/date checks and matching against the supplied mock registries. Uncertain results go to manual review.</span></div>
          <div><strong>Retention</strong><span>Documents should be retained only for the approved period needed for onboarding or a legal requirement. Accel Business must publish and implement the final retention schedule before real customer onboarding.</span></div>
          <div><strong>Your choices and rights</strong><span>You may withdraw consent for future processing and contact the privacy contact for access, correction, erasure or grievance requests, subject to applicable legal requirements.</span></div>
        </div>
        <p className="kyc-privacy-notice__contact">
          Privacy contact: <strong>{import.meta.env.VITE_PRIVACY_CONTACT || "Set VITE_PRIVACY_CONTACT before deployment"}</strong>.
          The production privacy notice must also identify the actual Data Fiduciary and its grievance channel.
        </p>
        <label className="kyc-consent">
          <input type="checkbox" checked={acceptedNotice} onChange={(event) => setAcceptedNotice(event.target.checked)} />
          <span>I have read the privacy notice above.</span>
        </label>
        <label className="kyc-consent">
          <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
          <span>I consent to processing the listed personal data for the stated KYC and business-verification purposes.</span>
        </label>
        <div className="kyc-privacy-notice__footer">
          <span><Info size={15} /> You can withdraw consent. KYC-dependent orders may not proceed where a required verification is incomplete.</span>
          <button className="profile-button profile-button--secondary" onClick={acceptNoticeAndConsent} disabled={!acceptedNotice || !consentAccepted}>Save Consent</button>
        </div>
        {consent?.acceptedAt && (
          <div className="kyc-consent-saved">
            <CheckCircle2 size={15} />
            {consent.isActive ? "Consent active" : "Consent withdrawn"} · recorded {new Date(consent.acceptedAt).toLocaleString("en-IN")} · {consent.noticeVersion}
            {consent.isActive && <button type="button" className="kyc-consent-saved__withdraw" onClick={withdrawConsent}>Withdraw consent</button>}
          </div>
        )}
      </section>

      {error && <div className="profile-alert profile-alert--error" role="alert">{error}</div>}
      {notice && <div className="profile-alert profile-alert--success" role="status">{notice}</div>}

      <div className="kyc-documents-heading">
        <div><h3>Your documents</h3><p>Upload clear, readable images. Maximum 5 MB per file.</p></div>
        <span className="kyc-documents-heading__count">{uploadedCount}/4 uploaded</span>
      </div>

      {loading ? (
        <div className="profile-loading"><LoaderCircle className="spin" />Loading document status…</div>
      ) : (
        <div className="kyc-documents">
          {DOCS.map((item) => {
            const doc = currentDocument(item.type);
            const status = doc?.status || "not-uploaded";

            return (
              <article className="kyc-document-card" key={item.type}>
                <div className="kyc-document-card__top">
                  <span className="kyc-document-card__icon"><FileText size={20} /></span>
                  <span className={`profile-status profile-status--${status}`}>
                    {doc ? <StatusIcon status={status} /> : null}
                    {status === "not-uploaded" ? "Not uploaded" : status[0].toUpperCase() + status.slice(1)}
                  </span>
                </div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
                <small className="kyc-document-card__purpose">{item.required}</small>

                {doc && (
                  <div className="kyc-document-card__uploaded">
                    <div>
                      <strong>{doc.originalName}</strong>
                      <span>Uploaded {new Date(doc.createdAt).toLocaleDateString("en-IN")} · {(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <button className="kyc-document-card__view" onClick={() => viewDocument(doc)} disabled={opening === doc._id}>
                      {opening === doc._id ? <LoaderCircle size={15} className="spin" /> : <Eye size={15} />}
                      View
                    </button>
                  </div>
                )}

                {doc?.qualityCheck && <QualityPanel quality={doc.qualityCheck} />}

                {doc?.classification && (
                  <div className={`kyc-classification kyc-classification--${doc.classification.outcome}`}>
                    <FileCheck2 size={15} />
                    <span>{doc.classification.note}</span>
                  </div>
                )}

                {doc?.maskedIdentifier && (
                  <div className="kyc-document-card__verification">
                    <strong>Identifier extracted</strong><span>{doc.maskedIdentifier}</span>
                  </div>
                )}
                {doc?.registryCheck?.registrationStatus && (
                  <div className="kyc-document-card__verification">
                    <strong>GST registration status</strong><span>{doc.registryCheck.registrationStatus}</span>
                  </div>
                )}
                {doc?.registryCheck && (
                  <div className="kyc-document-card__verification">
                    <strong>Registry matching</strong>
                    <span>
                      Name: {doc.registryCheck.nameMatch ? "Match" : "Review"} · State: {doc.registryCheck.stateMatch ? "Match" : "Review"}
                      {doc.registryCheck.activityMatch !== null && doc.registryCheck.activityMatch !== undefined
                        ? ` · Activity: ${doc.registryCheck.activityMatch ? "Match" : "Mismatch"}`
                        : ""}
                      {doc.registryCheck.cityMatch !== null && doc.registryCheck.cityMatch !== undefined
                        ? ` · City: ${doc.registryCheck.cityMatch ? "Match" : "Mismatch"}`
                        : ""}
                    </span>
                  </div>
                )}
                {doc?.registryCheck?.note && (
                  <div className="kyc-document-card__verification">
                    <strong>Registry result</strong><span>{doc.registryCheck.note}</span>
                  </div>
                )}
                {doc?.issueDate && (
                  <div className="kyc-document-card__verification">
                    <strong>Detected document date</strong><span>{new Date(doc.issueDate).toLocaleDateString("en-IN")}</span>
                  </div>
                )}
                {doc?.status === "rejected" && (
                  <div className="kyc-document-card__reason">
                    <strong>Reason for rejection</strong>
                    <span>{doc.rejectionReason || "Please upload a clearer or valid document."}</span>
                  </div>
                )}
                {doc?.status === "pending" && (
                  <div className="kyc-document-card__pending"><Clock3 size={15} />{doc.reviewNote || "Further review is required."}</div>
                )}
                {doc?.status === "accepted" && (
                  <div className="kyc-document-card__accepted"><ShieldCheck size={15} />Document passed the available verification checks.</div>
                )}

                <input
                  ref={(node) => { inputs.current[item.type] = node; }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => handleUpload(item.type, event.target.files?.[0])}
                />
                <button
                  className="profile-button profile-button--secondary kyc-document-card__upload"
                  disabled={Boolean(uploading) || (!consent?.isActive && !(acceptedNotice && consentAccepted))}
                  onClick={() => inputs.current[item.type]?.click()}
                >
                  {uploading === item.type ? <LoaderCircle size={16} className="spin" /> : doc ? <RefreshCw size={16} /> : <Upload size={16} />}
                  {uploading === item.type ? "Uploading…" : doc ? "Replace Document" : "Upload Document"}
                </button>
              </article>
            );
          })}
        </div>
      )}

      <p className="kyc-page__footnote">
        Poor-quality or clearly incorrect document uploads are stopped before storage. Replacing a document
        creates a new encrypted version; previous versions remain restricted until the approved retention
        and deletion process removes them.
      </p>
    </div>
  );
}

export default KYCVerification;
