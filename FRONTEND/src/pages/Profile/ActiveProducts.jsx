import { useEffect, useState } from "react";
import { Package, CalendarDays, RefreshCw, LoaderCircle, PackageCheck } from "lucide-react";
import { profileApi } from "../../services/profile.api";
import "./ActiveProducts.scss";

function daysLeft(date) { if (!date) return null; return Math.max(0, Math.ceil((new Date(date) - new Date()) / 86400000)); }
function ActiveProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { try { setError(""); const data = await profileApi.getActiveProducts(); setProducts(data.products || []); } catch (err) { setError(err.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  return (
    <div className="active-products">
      <header className="profile-section-heading"><div><span className="profile-section-heading__eyebrow">YOUR SERVICES</span><h2>Active Products</h2><p>See the services currently running for your business and their renewal dates.</p></div><button className="profile-icon-button" onClick={load} aria-label="Refresh active products"><RefreshCw size={17}/></button></header>
      {error && <div className="profile-alert profile-alert--error">{error}</div>}
      {loading ? <div className="profile-loading"><LoaderCircle className="spin"/>Loading active products…</div> : products.length === 0 ? <div className="profile-empty"><span><Package size={28}/></span><h3>No active products yet</h3><p>Once your order is verified and a service is activated, it will appear here.</p><a href="/explore" className="profile-button profile-button--primary">Explore products</a></div> : (
        <div className="active-products__list">{products.map((product) => {
          const remaining = daysLeft(product.expiresAt);
          const totalDays = product.activatedAt && product.expiresAt ? Math.max(1, Math.ceil((new Date(product.expiresAt) - new Date(product.activatedAt)) / 86400000)) : 365;
          const progress = remaining === null ? 0 : Math.max(0, Math.min(100, (remaining / totalDays) * 100));
          return <article className="active-product-card" key={product._id || product.productId}>
            <div className="active-product-card__icon"><PackageCheck size={21}/></div>
            <div className="active-product-card__main"><div className="active-product-card__title"><h3>{product.productName}</h3><span className={`profile-status profile-status--${(product.status || "active").toLowerCase()}`}>{product.status || "Active"}</span></div>
              <p>{product.description || "Business service"}</p>
              <div className="active-product-card__dates"><span><CalendarDays size={14}/>Activated: {product.activatedAt ? new Date(product.activatedAt).toLocaleDateString("en-IN") : "—"}</span><span><CalendarDays size={14}/>Renews: {product.expiresAt ? new Date(product.expiresAt).toLocaleDateString("en-IN") : "Not set"}</span></div>
              {remaining !== null && <><div className="active-product-card__progress"><span style={{ width: `${progress}%` }}/></div><small>{remaining} days remaining</small></>}
            </div>
          </article>;
        })}</div>
      )}
    </div>
  );
}
export default ActiveProducts;
