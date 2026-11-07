import { useEffect, useState } from "react";
import { Building2, MapPin, Save, LoaderCircle } from "lucide-react";
import { profileApi } from "../../services/profile.api";
import "./PersonalDetails.scss";

const emptyForm = { fullName: "", email: "", phone: "", businessName: "", category: "", location: "", deliveryAddress: "" };

function PersonalDetails({ profile, onProfileUpdated }) {
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setForm({ ...emptyForm, ...(profile || {}) }); }, [profile]);

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setMessage(""); setError("");
    try {
      await profileApi.updateProfile(form);
      await onProfileUpdated?.();
      setEditing(false);
      setMessage("Your business details have been saved.");
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const fields = [
    { name: "fullName", label: "Full name", placeholder: "Your name", required: true },
    { name: "email", label: "Email address", placeholder: "you@example.com", type: "email" },
    { name: "phone", label: "Phone number", placeholder: "+91 …" },
    { name: "businessName", label: "Business name", placeholder: "Registered business name", required: true },
    { name: "category", label: "Business category", placeholder: "Select category", select: true },
    { name: "location", label: "Business location", placeholder: "City, state" },
    { name: "deliveryAddress", label: "Delivery address", placeholder: "Full address", textarea: true },
  ];

  return (
    <div className="personal-details">
      <header className="profile-section-heading">
        <div><span className="profile-section-heading__eyebrow">YOUR ACCOUNT</span><h2>Personal & Business Details</h2><p>Keep your information up to date for a smoother onboarding experience.</p></div>
        {!editing && <button className="profile-button profile-button--secondary" onClick={() => setEditing(true)}>Edit Details</button>}
      </header>
      {message && <div className="profile-alert profile-alert--success">{message}</div>}
      {error && <div className="profile-alert profile-alert--error">{error}</div>}
      <form className="personal-details__card" onSubmit={handleSubmit}>
        <div className="personal-details__group-title"><span className="personal-details__group-icon"><Building2 size={18} /></span><div><h3>Business information</h3><p>Information used to personalise your Accel Business experience.</p></div></div>
        <div className="personal-details__grid">
          {fields.map((field) => (
            <label className={`profile-field ${field.textarea ? "profile-field--wide" : ""}`} key={field.name}>
              <span>{field.label}{field.required && <b> *</b>}</span>
              {field.select ? (
                <select name={field.name} value={form[field.name]} onChange={change} disabled={!editing}>
                  <option value="">Choose a category</option><option>Retail</option><option>Professional Services</option><option>Manufacturing</option><option>Hospitality</option><option>Healthcare</option><option>Education</option><option>Other</option>
                </select>
              ) : field.textarea ? (
                <textarea name={field.name} value={form[field.name]} onChange={change} placeholder={field.placeholder} disabled={!editing} rows={3} />
              ) : (
                <input name={field.name} type={field.type || "text"} value={form[field.name]} onChange={change} placeholder={field.placeholder} disabled={!editing} required={field.required} />
              )}
            </label>
          ))}
        </div>
        <div className="personal-details__footer">
          <span><MapPin size={15} /> Your saved details are linked to your account.</span>
          {editing && <div><button type="button" className="profile-button profile-button--secondary" onClick={() => { setForm({ ...emptyForm, ...(profile || {}) }); setEditing(false); }}>Cancel</button><button className="profile-button profile-button--primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}Save Changes</button></div>}
        </div>
      </form>
    </div>
  );
}
export default PersonalDetails;
