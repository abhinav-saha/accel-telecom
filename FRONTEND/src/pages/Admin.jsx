import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, LoaderCircle, LogOut, Package, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { adminApi } from "../services/admin.api";
import { formatPrice } from "../data/productCatalogue";
import "./Admin.scss";

const STATUSES = [
  ["order_placed", "Order Placed"], ["payment_confirmed", "Payment Confirmed"], ["kyc_verification", "KYC Verification"],
  ["service_provisioning", "Service Provisioning"], ["installation_scheduled", "Installation Scheduled"],
  ["installation_activation", "Installation & Activation"], ["completed", "Completed"],
  ["on_hold", "On Hold"], ["action_required", "Action Required"], ["cancelled", "Cancelled"], ["failed", "Failed"],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Admin() {
  const [loggedIn, setLoggedIn] = useState(adminApi.isLoggedIn());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState("order_placed");
  const [message, setMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [expectedCompletionAt, setExpectedCompletionAt] = useState("");

  const selectedOrder = orders.find((order) => order.orderNumber === selectedId) || null;

  async function loadOrders() {
    setLoading(true);
    try {
      setError("");
      const result = await adminApi.getOrders();
      setOrders(result.orders || []);
      setSelectedId((current) => current && result.orders.some((order) => order.orderNumber === current) ? current : result.orders[0]?.orderNumber || "");
    } catch (requestError) {
      setError(requestError.message || "Could not load orders.");
      if (/login|authoris|token/i.test(requestError.message)) { adminApi.logout(); setLoggedIn(false); }
    } finally { setLoading(false); }
  }

  useEffect(() => { if (loggedIn) loadOrders(); }, [loggedIn]);

  useEffect(() => {
    if (!selectedOrder) return;
    setStatus(selectedOrder.status);
    setMessage("");
    setInternalNote("");
    setExpectedCompletionAt(selectedOrder.expectedCompletionAt ? new Date(selectedOrder.expectedCompletionAt).toISOString().slice(0, 10) : "");
  }, [selectedId]);

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => [order.orderNumber, order.customer?.fullName, order.customer?.businessName, order.customer?.phone].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [orders, search]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setError("");
    try { await adminApi.login(email, password); setLoggedIn(true); setPassword(""); }
    catch (requestError) { setError(requestError.message || "Admin login failed."); }
    finally { setLoginLoading(false); }
  }

  async function handleUpdate(event) {
    event.preventDefault();
    if (!selectedOrder) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const result = await adminApi.updateOrder(selectedOrder.orderNumber, { status, message, internalNote, expectedCompletionAt: expectedCompletionAt || null });
      setOrders((current) => current.map((order) => order.orderNumber === result.order.orderNumber ? result.order : order));
      setSuccess("Order status and tracking history updated.");
      setMessage(""); setInternalNote("");
    } catch (requestError) { setError(requestError.message || "Could not update the order."); }
    finally { setSaving(false); }
  }

  function logout() { adminApi.logout(); setLoggedIn(false); setOrders([]); setSelectedId(""); }

  if (!loggedIn) {
    return (
      <main className="admin-page admin-page--login">
        <form className="admin-login" onSubmit={handleLogin}>
          <div className="admin-login__icon"><ShieldCheck size={27} /></div>
          <p className="admin-page__eyebrow">ACCEL BUSINESS · OPERATIONS</p>
          <h1>Admin sign in</h1>
          <p>Sign in with your authorised operations account to manage customer orders.</p>
          <label>Admin email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
          {error && <div className="admin-alert admin-alert--error"><AlertCircle size={16} />{error}</div>}
          <button type="submit" className="admin-button admin-button--primary" disabled={loginLoading}>{loginLoading ? <><LoaderCircle size={17} className="admin-spin" /> Signing in…</> : "Sign in"}<ArrowRight size={16} /></button>
          <a href="/" className="admin-login__back">Back to customer website</a>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-shell">
        <header className="admin-header">
          <div><p className="admin-page__eyebrow">ACCEL BUSINESS · OPERATIONS</p><h1>Order Management</h1><p>Manage customer orders and publish live tracking updates.</p></div>
          <div className="admin-header__actions"><button type="button" className="admin-button" onClick={loadOrders}><RefreshCw size={15} /> Refresh</button><button type="button" className="admin-button" onClick={logout}><LogOut size={15} /> Sign out</button></div>
        </header>
        {error && <div className="admin-alert admin-alert--error"><AlertCircle size={16} />{error}</div>}
        {success && <div className="admin-alert admin-alert--success"><CheckCircle2 size={16} />{success}</div>}
        <div className="admin-stats"><div><Package size={18} /><span>Total orders</span><strong>{orders.length}</strong></div><div><ClipboardList size={18} /><span>In progress</span><strong>{orders.filter((order) => !["completed", "cancelled", "failed"].includes(order.status)).length}</strong></div><div><CheckCircle2 size={18} /><span>Completed</span><strong>{orders.filter((order) => order.status === "completed").length}</strong></div></div>
        <div className="admin-workspace">
          <section className="admin-orders-panel">
            <div className="admin-panel-heading"><div><h2>Orders</h2><span>{filteredOrders.length} records</span></div><div className="admin-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order or customer" /></div></div>
            {loading ? <div className="admin-empty"><LoaderCircle className="admin-spin" size={21} /> Loading orders…</div> : filteredOrders.length ? (
              <div className="admin-order-list">{filteredOrders.map((order) => (
                <button type="button" key={order._id} className={`admin-order-row ${selectedId === order.orderNumber ? "is-selected" : ""}`} onClick={() => setSelectedId(order.orderNumber)}>
                  <span className="admin-order-row__top"><strong>{order.orderNumber}</strong><small>{dateTime(order.createdAt)}</small></span>
                  <span className="admin-order-row__customer">{order.customer?.businessName || "Business"} · {order.customer?.fullName || "Customer"}</span>
                  <span className="admin-order-row__bottom"><em className={`admin-status admin-status--${order.status}`}>{STATUS_LABEL[order.status] || order.status}</em><b>{formatPrice(order.totalMonthly || 0)}/mo</b></span>
                </button>
              ))}</div>
            ) : <div className="admin-empty">No orders found.</div>}
          </section>

          <section className="admin-detail-panel">
            {!selectedOrder ? <div className="admin-empty"><ClipboardList size={28} />Select an order to view and update it.</div> : <>
              <div className="admin-detail-heading"><div><span className="admin-detail-heading__id">{selectedOrder.orderNumber}</span><h2>{selectedOrder.customer?.businessName}</h2><p>Placed {dateTime(selectedOrder.createdAt)}</p></div><em className={`admin-status admin-status--${selectedOrder.status}`}>{STATUS_LABEL[selectedOrder.status] || selectedOrder.status}</em></div>
              <div className="admin-customer"><h3>Customer details</h3><div><span>Contact</span><strong>{selectedOrder.customer?.fullName}</strong></div><div><span>Phone</span><strong>{selectedOrder.customer?.phone}</strong></div><div><span>Email</span><strong>{selectedOrder.customer?.email || "Not provided"}</strong></div><div><span>Service address</span><strong>{selectedOrder.customer?.serviceAddress}</strong></div></div>
              <div className="admin-products"><h3>Ordered products</h3>{selectedOrder.items?.map((item) => <div key={`${item.productId}-${item.productName}`}><span>{item.productName} <small>× {item.quantity}</small></span><strong>{formatPrice(item.monthlyPrice * item.quantity)}/mo</strong></div>)}<div className="admin-products__total"><span>Monthly total</span><strong>{formatPrice(selectedOrder.totalMonthly || 0)}/mo</strong></div></div>
              <form className="admin-update-form" onSubmit={handleUpdate}>
                <h3>Update order tracking</h3>
                <label>New status<select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>Customer-visible update<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={500} placeholder="Example: Your broadband installation is scheduled for tomorrow." /></label>
                <label>Internal note <span>(not shown to customer)</span><textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} rows={2} maxLength={1000} placeholder="Internal operations note" /></label>
                <label>Expected completion date<input type="date" value={expectedCompletionAt} onChange={(event) => setExpectedCompletionAt(event.target.value)} /></label>
                <button type="submit" className="admin-button admin-button--primary" disabled={saving || (selectedOrder.status === "completed" && status !== "completed")}>{saving ? <><LoaderCircle size={16} className="admin-spin" /> Saving…</> : "Publish tracking update"}</button>
                {selectedOrder.status === "completed" && <p className="admin-form-note">This order is completed and cannot be reopened.</p>}
              </form>
              <div className="admin-history"><h3>Update history</h3>{[...(selectedOrder.trackingHistory || [])].reverse().map((event, index) => <div key={`${event.status}-${event.updatedAt}-${index}`}><span className="admin-history__dot" /><div><strong>{STATUS_LABEL[event.status] || event.status}</strong><p>{event.message}</p><small>{dateTime(event.updatedAt)} · {event.updatedBy?.role || "system"}</small>{event.internalNote && <small className="admin-history__private">Internal: {event.internalNote}</small>}</div></div>)}</div>
            </>}
          </section>
        </div>
      </div>
    </main>
  );
}

export default Admin;
