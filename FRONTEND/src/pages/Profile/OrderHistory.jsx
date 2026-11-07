import { useEffect, useState } from "react";
import { ReceiptText, LoaderCircle, RefreshCw, PackageSearch } from "lucide-react";
import { formatPrice } from "../../data/productCatalogue";
import { profileApi } from "../../services/profile.api";
import "./OrderHistory.scss";

function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { try { setError(""); const data = await profileApi.getOrders(); setOrders(data.orders || []); } catch (err) { setError(err.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  return (
    <div className="order-history">
      <header className="profile-section-heading"><div><span className="profile-section-heading__eyebrow">PURCHASES</span><h2>Order History</h2><p>Review your previous orders and their latest status.</p></div><button className="profile-icon-button" onClick={load} aria-label="Refresh orders"><RefreshCw size={17}/></button></header>
      {error && <div className="profile-alert profile-alert--error">{error}</div>}
      {loading ? <div className="profile-loading"><LoaderCircle className="spin"/>Loading orders…</div> : orders.length === 0 ? <div className="profile-empty"><span><PackageSearch size={28}/></span><h3>No orders yet</h3><p>Your completed checkouts will appear here, including KYC and activation progress.</p><a href="/explore" className="profile-button profile-button--primary">Browse solutions</a></div> : (
        <div className="order-history__list">{orders.map((order) => <article className="order-card" key={order._id}>
          <div className="order-card__header"><div><span className="order-card__number">ORDER {order.orderNumber || String(order._id).slice(-8).toUpperCase()}</span><h3>{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</h3></div><span className={`profile-status profile-status--${String(order.status || "pending").toLowerCase().replaceAll(" ", "-")}`}>{order.status || "Pending"}</span></div>
          <div className="order-card__items">{(order.items || []).map((item, index) => <div key={`${item.productId || item.product_id}-${index}`}><span>{item.productName || item.product_name} <small>× {item.quantity || 1}</small></span><strong>{item.monthlyPrice ? `${formatPrice(item.monthlyPrice)}/mo` : "—"}</strong></div>)}</div>
          <div className="order-card__footer"><span>{(order.items || []).length} product(s)</span><strong>{formatPrice(order.totalMonthly || 0)}<small>/month</small></strong></div>
        </article>)}</div>
      )}
    </div>
  );
}
export default OrderHistory;
