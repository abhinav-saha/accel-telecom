import { useEffect, useRef, useState } from "react";
import { ShieldCheck, FileText, Upload, Eye, RefreshCw, CheckCircle2, Clock3, XCircle, LoaderCircle, Info, LockKeyhole } from "lucide-react";
import { profileApi } from "../../services/profile.api";
import "./KYCVerification.scss";

const DOCS = [
  { type: "addressProof", title: "Business Address Proof", description: "Recent utility bill, bank statement, rent agreement or other accepted address proof.", required: "Used to verify the business address." },
  { type: "gstCertificate", title: "GST Registration Certificate", description: "Upload the GST registration certificate showing your GSTIN.", required: "Required only when a selected product or onboarding rule requires GSTIN." },
  { type: "udyamCertificate", title: "Udyam Registration Certificate", description: "Upload your MSME Udyam registration certificate, if registered.", required: "Used to validate MSME registration and applicable product eligibility." },
  { type: "signatoryId", title: "Authorised Signatory ID", description: "Upload an accepted identity document for the person authorised to sign for the business.", required: "Used to verify the authorised signatory." },
];

function StatusIcon({ status }) {
  if (status === "accepted") return <CheckCircle2 size={16}/>;
  if (status === "rejected") return <XCircle size={16}/>;
  return <Clock3 size={16}/>;
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
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const currentDocument = (type) => documents.find((doc) => doc.type === type && doc.isCurrent !== false);

  async function handleUpload(type, file) {
    if (!file) return;
    const hasActiveConsent = Boolean(consent?.isActive && consent?.acceptedAt);
    if (!hasActiveConsent && (!acceptedNotice || !consentAccepted)) {
      setError("Please read the privacy notice and provide consent before uploading KYC documents.");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setError("Upload a JPG, PNG or WEBP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Each document must be 5 MB or smaller."); return; }
    setUploading(type); setError(""); setNotice("");
    try {
      if (!hasActiveConsent) {
        const saved = await profileApi.saveKycConsent({ accepted: true, noticeVersion: "kyc-notice-v1" });
        setConsent(saved.consent);
      }
      await profileApi.uploadKyc(type, file);
      setNotice("Document uploaded. Its status is now Pending Review.");
      await load();
    } catch (err) { setError(err.message); }
    finally { setUploading(""); if (inputs.current[type]) inputs.current[type].value = ""; }
  }

  async function viewDocument(doc) {
    setOpening(doc._id); setError("");
    try {
      const blob = await profileApi.getKycFile(doc._id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setError(err.message); }
    finally { setOpening(""); }
  }

  async function withdrawConsent() {
    if (!window.confirm("Withdraw consent for KYC processing? New document uploads will be disabled.")) return;
    try {
      const result = await profileApi.withdrawKycConsent();
      setConsent(result.consent);
      setNotice("KYC consent withdrawn. New uploads are disabled.");
    } catch (err) { setError(err.message); }
  }

  async function acceptNoticeAndConsent() {
    if (!acceptedNotice || !consentAccepted) { setError("Please confirm that you have read the notice and agree to KYC processing."); return; }
    try {
      setError("");
      const result = await profileApi.saveKycConsent({ accepted: true, noticeVersion: "kyc-notice-v1" });
      setConsent(result.consent);
      setNotice("Your KYC consent preference has been saved.");
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="kyc-page">
      <header className="profile-section-heading"><div><span className="profile-section-heading__eyebrow">IDENTITY & BUSINESS CHECKS</span><h2>KYC Verification</h2><p>Upload and track the documents needed to verify your business.</p></div><button className="profile-icon-button" onClick={load} aria-label="Refresh KYC status"><RefreshCw size={17}/></button></header>

      <section className="kyc-privacy-notice">
        <div className="kyc-privacy-notice__heading"><span><LockKeyhole size={18}/></span><div><h3>Why do we need these documents?</h3><p>Privacy notice · Version 1.0</p></div></div>
        <p>We request these documents to verify your business identity and address, confirm the authority of the signatory, validate GSTIN or Udyam details where relevant, prevent fraudulent onboarding, and determine eligibility for the products you select. We will use the information only for these stated onboarding and service purposes. Access is limited to authorised onboarding reviewers and relevant hosting, OCR and verification service providers who need it; the final privacy policy must identify the actual providers.</p>
        <div className="kyc-privacy-notice__details"><div><strong>Information collected</strong><span>Document images and relevant details extracted from them, such as business name, address, registration identifiers and issue date.</span></div><div><strong>How it is used</strong><span>OCR-assisted extraction, format/date checks and comparison with available verification records. Automated checks may be referred for human review.</span></div><div><strong>Retention</strong><span>Documents should be retained only for as long as needed for the stated purpose or a legal requirement. The final retention period must be set in Accel Business's published privacy policy.</span></div><div><strong>Your choices and rights</strong><span>You may request access, correction or erasure, and withdraw consent through the privacy contact shown below. Withdrawal may prevent completion of KYC-dependent services.</span></div></div>
        <p className="kyc-privacy-notice__contact">Privacy contact: <strong>{import.meta.env.VITE_PRIVACY_CONTACT || "Set VITE_PRIVACY_CONTACT before deployment"}</strong>. For unresolved grievances, use the complaint route published in the final privacy policy.</p>
        <label className="kyc-consent"><input type="checkbox" checked={acceptedNotice} onChange={(e) => setAcceptedNotice(e.target.checked)}/><span>I have read the privacy notice above.</span></label>
        <label className="kyc-consent"><input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)}/><span>I consent to the processing of the listed personal data for KYC and business verification purposes.</span></label>
        <div className="kyc-privacy-notice__footer"><span><Info size={15}/> You can withdraw consent, but KYC-dependent orders may not proceed without required verification.</span><button className="profile-button profile-button--secondary" onClick={acceptNoticeAndConsent} disabled={!acceptedNotice || !consentAccepted}>Save Consent</button></div>
        {consent?.acceptedAt && <div className="kyc-consent-saved"><CheckCircle2 size={15}/> {consent.isActive ? "Consent active" : "Consent withdrawn"} · recorded {new Date(consent.acceptedAt).toLocaleString("en-IN")} · {consent.noticeVersion}{consent.isActive && <button type="button" className="kyc-consent-saved__withdraw" onClick={withdrawConsent}>Withdraw consent</button>}</div>}
      </section>

      {error && <div className="profile-alert profile-alert--error">{error}</div>}
      {notice && <div className="profile-alert profile-alert--success">{notice}</div>}

      <div className="kyc-documents-heading"><div><h3>Your documents</h3><p>Upload clear, readable images. Maximum 5 MB per file.</p></div><span className="kyc-documents-heading__count">{documents.filter((doc) => doc.isCurrent !== false).length}/4 uploaded</span></div>
      {loading ? <div className="profile-loading"><LoaderCircle className="spin"/>Loading document status…</div> : <div className="kyc-documents">{DOCS.map((item) => {
        const doc = currentDocument(item.type);
        const status = doc?.status || "not-uploaded";
        return <article className="kyc-document-card" key={item.type}>
          <div className="kyc-document-card__top"><span className="kyc-document-card__icon"><FileText size={20}/></span><span className={`profile-status profile-status--${status}`}>{doc ? <StatusIcon status={status}/> : null}{status === "not-uploaded" ? "Not uploaded" : status[0].toUpperCase() + status.slice(1)}</span></div>
          <h4>{item.title}</h4><p>{item.description}</p><small className="kyc-document-card__purpose">{item.required}</small>
          {doc && <div className="kyc-document-card__uploaded"><div><strong>{doc.originalName}</strong><span>Uploaded {new Date(doc.createdAt).toLocaleDateString("en-IN")} · {(doc.size / 1024 / 1024).toFixed(2)} MB</span></div><button className="kyc-document-card__view" onClick={() => viewDocument(doc)} disabled={opening === doc._id}>{opening === doc._id ? <LoaderCircle size={15} className="spin"/> : <Eye size={15}/>}View</button></div>}
          {doc?.status === "rejected" && <div className="kyc-document-card__reason"><strong>Reason for rejection</strong><span>{doc.rejectionReason || "Please upload a clearer or valid document."}</span></div>}
          {doc?.status === "pending" && <div className="kyc-document-card__pending"><Clock3 size={15}/>We are reviewing this document. You will see the decision here.</div>}
          {doc?.status === "accepted" && <div className="kyc-document-card__accepted"><CheckCircle2 size={15}/>Document verified successfully.</div>}
          <input ref={(node) => { inputs.current[item.type] = node; }} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => handleUpload(item.type, e.target.files?.[0])}/>
          <button className="profile-button profile-button--secondary kyc-document-card__upload" disabled={!!uploading || (!consent?.isActive && !(acceptedNotice && consentAccepted))} onClick={() => inputs.current[item.type]?.click()}>{uploading === item.type ? <LoaderCircle size={16} className="spin"/> : doc ? <RefreshCw size={16}/> : <Upload size={16} />}{uploading === item.type ? "Uploading…" : doc ? "Replace Document" : "Upload Document"}</button>
        </article>;
      })}</div>}
      <p className="kyc-page__footnote">A replacement upload becomes the current version and returns to Pending Review. Previous versions remain restricted for audit until the applicable retention period ends.</p>
    </div>
  );
}
export default KYCVerification;
