import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserRound, Bookmark, Package, ShieldCheck, ReceiptText, LogOut,
  ChevronRight, LoaderCircle, AlertCircle,
} from "lucide-react";
import { profileApi, signOut } from "../../services/profile.api";
import PersonalDetails from "./PersonalDetails";
import SavedBundles from "./SavedBundles";
import ActiveProducts from "./ActiveProducts";
import KYCVerification from "./KYCVerification";
import OrderHistory from "./OrderHistory";
import "./Profile.scss";

const sections = [
  { id: "personal", label: "Personal Details", icon: UserRound },
  { id: "bundles", label: "Saved Bundles", icon: Bookmark },
  { id: "products", label: "Active Products", icon: Package },
  { id: "kyc", label: "KYC Verification", icon: ShieldCheck },
  { id: "orders", label: "Order History", icon: ReceiptText },
];

function Profile() {
  const [activeSection, setActiveSection] = useState("personal");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();

  async function loadProfile() {
    try {
      setPageError("");
      const result = await profileApi.getProfile();
      setProfile(result.profile || {});
    } catch (error) {
      setPageError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProfile(); }, []);

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setPageError(error.message);
      setSigningOut(false);
    }
  }

  function renderSection() {
    const common = { profile, onProfileUpdated: loadProfile };
    switch (activeSection) {
      case "bundles": return <SavedBundles />;
      case "products": return <ActiveProducts />;
      case "kyc": return <KYCVerification />;
      case "orders": return <OrderHistory />;
      default: return <PersonalDetails {...common} />;
    }
  }

  return (
    <main className="profile-page">
      <div className="profile-page__heading">
        <div>
          <p className="profile-page__eyebrow">ACCOUNT CENTRE</p>
          <h1>My Business Profile</h1>
          <p>Manage your business information, services and verification.</p>
        </div>
      </div>

      {pageError && <div className="profile-alert profile-alert--error"><AlertCircle size={18} />{pageError}</div>}

      <div className="profile-layout">
        <aside className="profile-sidebar" aria-label="Profile navigation">
          <div className="profile-sidebar__identity">
            <div className="profile-sidebar__avatar">
              {(profile?.fullName || profile?.username || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-sidebar__identity-copy">
              <strong>{profile?.fullName || profile?.username || "Your account"}</strong>
              <span>{profile?.businessName || "Business profile"}</span>
            </div>
          </div>
          <div className="profile-sidebar__divider" />
          <nav className="profile-sidebar__nav">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`profile-sidebar__link ${activeSection === id ? "is-active" : ""}`}
                onClick={() => setActiveSection(id)}
                aria-current={activeSection === id ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
                <ChevronRight className="profile-sidebar__chevron" size={15} />
              </button>
            ))}
          </nav>
          <div className="profile-sidebar__bottom">
            <button type="button" className="profile-sidebar__link profile-sidebar__logout" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? <LoaderCircle size={18} className="spin" /> : <LogOut size={18} />}
              <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
            </button>
          </div>
        </aside>

        <section className="profile-content" aria-live="polite">
          {loading ? (
            <div className="profile-loading"><LoaderCircle className="spin" size={25} />Loading your profile…</div>
          ) : renderSection()}
        </section>
      </div>
    </main>
  );
}

export default Profile;
