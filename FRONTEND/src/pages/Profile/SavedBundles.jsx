import { useEffect, useState } from "react";
import { Bookmark, ShoppingCart, Trash2, Sparkles, LoaderCircle, PackageOpen } from "lucide-react";
import { useCart } from "../../context/CartContext";
import { formatPrice } from "../../data/productCatalogue";
import { profileApi } from "../../services/profile.api";
import "./SavedBundles.scss";

function SavedBundles() {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { addToCart } = useCart();

  async function load() {
    try { setError(""); const data = await profileApi.getBundles(); setBundles(data.bundles || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addBundle(bundle) {
    setBusyId(bundle._id || bundle.bundleId);
    try {
      (bundle.products || []).forEach((product) => addToCart(product));
      setNotice(`${bundle.name} added to your cart.`);
    } catch (err) { setError(err.message || "Could not add this bundle to cart."); }
    finally { setBusyId(""); }
  }

  async function removeBundle(bundle) {
    const id = bundle._id || bundle.bundleId;
    setBusyId(id);
    try { await profileApi.deleteBundle(id); setBundles((items) => items.filter((item) => (item._id || item.bundleId) !== id)); }
    catch (err) { setError(err.message); }
    finally { setBusyId(""); }
  }

  return (
    <div className="saved-bundles">
      <header className="profile-section-heading"><div><span className="profile-section-heading__eyebrow">AI RECOMMENDATIONS</span><h2>Saved Bundles</h2><p>Your shortlisted business solutions, ready when you are.</p></div><span className="saved-bundles__count">{bundles.length} saved</span></header>
      {notice && <div className="profile-alert profile-alert--success">{notice}</div>}{error && <div className="profile-alert profile-alert--error">{error}</div>}
      {loading ? <div className="profile-loading"><LoaderCircle className="spin" />Loading saved bundles…</div> : bundles.length === 0 ? (
        <div className="profile-empty"><span><PackageOpen size={28}/></span><h3>No saved bundles yet</h3><p>When the AI advisor recommends a bundle you like, save it to find it here later.</p><a href="/for-you" className="profile-button profile-button--primary">Explore recommendations <Sparkles size={16}/></a></div>
      ) : <div className="saved-bundles__grid">{bundles.map((bundle) => (
        <article className="saved-bundle-card" key={bundle._id || bundle.bundleId}>
          <div className="saved-bundle-card__top"><span className="saved-bundle-card__icon"><Bookmark size={18}/></span><button className="saved-bundle-card__remove" onClick={() => removeBundle(bundle)} disabled={!!busyId} aria-label={`Remove ${bundle.name}`}><Trash2 size={17}/></button></div>
          <h3>{bundle.name}</h3><p className="saved-bundle-card__description">{bundle.description || "A solution selected for your business needs."}</p>
          {bundle.reason && <div className="saved-bundle-card__reason"><Sparkles size={15}/><span>{bundle.reason}</span></div>}
          <div className="saved-bundle-card__products"><strong>Included products</strong>{(bundle.products || []).map((product) => <span key={product.product_id}>{product.product_name}</span>)}</div>
          <div className="saved-bundle-card__footer"><div><small>Estimated monthly price</small><strong>{formatPrice(bundle.monthlyPrice || (bundle.products || []).reduce((sum, p) => sum + Number(p.price_min_inr_per_month || 0), 0))}<small>/month</small></strong></div><button className="profile-button profile-button--primary" onClick={() => addBundle(bundle)} disabled={!!busyId}>{busyId === (bundle._id || bundle.bundleId) ? <LoaderCircle className="spin" size={16}/> : <ShoppingCart size={16}/>}Add to Cart</button></div>
        </article>
      ))}</div>}
    </div>
  );
}
export default SavedBundles;
