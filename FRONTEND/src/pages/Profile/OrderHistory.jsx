import { useEffect, useMemo, useState } from "react";
import {
  ReceiptText, PackageSearch, CheckCircle2, Circle, Clock3, CreditCard,
  ShieldCheck, Settings2, Wifi, CalendarDays, MapPin, LoaderCircle,
  AlertCircle, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { profileApi } from "../../services/profile.api";
import { formatPrice } from "../../data/productCatalogue";
import "./OrderHistory.scss";

const STAGES = [
  { key: "order_placed", title: "Order Placed", description: "Your order has been successfully placed.", icon: ReceiptText },
  { key: "payment_confirmed", title: "Payment Confirmed", description: "Payment confirmation has been recorded.", icon: CreditCard },
  { key: "kyc_verification", title: "KYC Verification", description: "Your business documents are being verified.", icon: ShieldCheck },
  { key: "service_provisioning", title: "Service Provisioning", description: "Your selected services are being configured.", icon: Settings2 },
  { key: "installation_scheduled", title: "Installation Scheduled", description: "The installation visit is being arranged.", icon: CalendarDays },
  { key: "installation_activation", title: "Installation & Activation", description: "Installation and service activation are in progress.", icon: Wifi },
  { key: "completed", title: "Completed", description: "Your ordered services are ready to use.", icon: CheckCircle2 },
];

const STATUS_LABELS = {
  order_placed: "Order Placed", payment_confirmed: "Payment Confirmed", kyc_verification: "KYC Verification",
  service_provisioning: "Service Provisioning", installation_scheduled: "Installation Scheduled",
  installation_activation: "Installation & Activation", completed: "Completed", on_hold: "On Hold",
  action_required: "Action Required", cancelled: "Cancelled", failed: "Failed",
};
const CLOSED = new Set(["completed", "cancelled", "failed"]);
const EXCEPTIONS = new Set(["on_hold", "action_required", "cancelled", "failed"]);

function dateTime(value) {
  if (!value) return "Awaiting update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting update";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function dateOnly(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function OrderTimeline({ order }) {
  const history = order.trackingHistory || [];
  const currentStageEvent = [...history].reverse().find((event) => STAGES.some((stage) => stage.key === event.status));
  const activeKey = STAGES.some((stage) => stage.key === order.status) ? order.status : currentStageEvent?.status || "order_placed";
  const activeIndex = STAGES.findIndex((stage) => stage.key === activeKey);
  const eventByStatus = new Map();
  history.forEach((event) => eventByStatus.set(event.status, event));

  return (
    <div className="order-tracking">
      <div className="order-tracking__heading"><div><h4>Live order tracking</h4><p>Updates are published by the Accel Business team.</p></div><Clock3 size={19} /></div>
      {EXCEPTIONS.has(order.status) && (
        <div className={`order-tracking__alert order-tracking__alert--${order.status}`}>
          <strong>{STATUS_LABELS[order.status]}</strong>
          <span>{history[history.length - 1]?.message || "Our team will update you shortly."}</span>
        </div>
      )}
      <div className="order-timeline">
        {STAGES.map((stage, index) => {
          const Icon = stage.icon;
          const event = eventByStatus.get(stage.key);
          const isDone = index <= activeIndex;
const isCurrent = false;

const state = isDone ? "completed" : "upcoming";
          return (
            <div className={`order-timeline__step order-timeline__step--${state}`} key={stage.key}>
              <div className="order-timeline__marker">
                {state === "completed" ? <CheckCircle2 size={20} /> : state === "current" ? <span className="order-timeline__active-icon"><Icon size={17} /></span> : <Circle size={20} />}
              </div>
              <div className="order-timeline__content">
                <div className="order-timeline__title"><strong>{stage.title}</strong>{state === "current" && <span className="order-timeline__current-label">IN PROGRESS</span>}</div>
                <p>{event?.message || stage.description}</p>
                <span className="order-timeline__date">{event ? dateTime(event.updatedAt) : state === "upcoming" ? "Upcoming" : "Completed"}</span>
              </div>
            </div>
          );
        })}
      </div>
      {order.expectedCompletionAt && <p className="order-history__eta"><CalendarDays size={15} /> Expected completion: <strong>{dateOnly(order.expectedCompletionAt)}</strong></p>}
    </div>
  );
}

function OrderProducts({ items = [] }) {
  return (
    <div className="current-order__products">
      {items.map((item) => (
        <div className="current-order__product" key={`${item.productId}-${item.productName}`}>
          <div className="current-order__product-icon"><PackageSearch size={19} /></div>
          <div className="current-order__product-info"><strong>{item.productName}</strong><span>Quantity: {item.quantity}</span></div>
          <strong>{formatPrice(item.monthlyPrice * item.quantity)}/mo</strong>
        </div>
      ))}
    </div>
  );
}

function OrderCard({ order, expanded, onToggle }) {
  return (
    <article className="order-card">
      <button type="button" className="order-card__toggle" onClick={onToggle} aria-expanded={expanded}>
        <div className="order-card__main">
          <div className="order-card__icon"><ReceiptText size={19} /></div>
          <div><span className="order-card__number">{order.orderNumber}</span><h4>{dateOnly(order.createdAt)}</h4><span className="order-card__count">{order.items?.length || 0} product(s)</span></div>
        </div>
        <div className="order-card__summary">
          <span className={`profile-status profile-status--${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
          <strong>{formatPrice(order.totalMonthly || 0)}/mo</strong>
          {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </div>
      </button>
      {expanded && <div className="order-card__expanded"><OrderProducts items={order.items || []} /><OrderTimeline order={order} /></div>}
    </article>
  );
}

function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedOrders, setExpandedOrders] = useState([]);

  async function loadOrders() {
    try {
      setError("");
      const result = await profileApi.getOrders();
      setOrders(result.orders || []);
    } catch (requestError) {
      setError(requestError.message || "Could not load your order history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOrders(); }, []);

  // Poll quietly so admin changes appear in the customer tracker without a manual refresh.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const result = await profileApi.getOrders();
        setOrders(result.orders || []);
      } catch (_) {
        // Keep the last successfully loaded order state visible during transient failures.
      }
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const { activeOrders, pastOrders } = useMemo(() => ({
    activeOrders: orders.filter((order) => !CLOSED.has(order.status)),
    pastOrders: orders.filter((order) => CLOSED.has(order.status)),
  }), [orders]);

  function toggleOrder(id) {
    setExpandedOrders((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  }

  if (loading) return <div className="order-history__state"><LoaderCircle className="order-history__spin" size={23} />Loading your orders…</div>;

  return (
    <div className="order-history">
      <header className="profile-section-heading">
        <div><span className="profile-section-heading__eyebrow">PURCHASES</span><h2>Order History</h2><p>Track active orders and review completed purchases. Updates sync automatically.</p></div>
        <button type="button" className="order-history__refresh" onClick={loadOrders}><RefreshCw size={15} /> Refresh</button>
      </header>
      {error && <div className="order-history__error"><AlertCircle size={17} />{error}</div>}

      <section className="current-orders">
        <div className="past-orders__heading"><div><h3>Active Orders</h3><p>Orders that are still being processed.</p></div><span>{activeOrders.length} orders</span></div>
        {activeOrders.length ? activeOrders.map((order) => (
          <section className="current-order" key={order._id || order.orderNumber}>
            <div className="current-order__header">
              <div><span className="order-card__number">ORDER ID · {order.orderNumber}</span><h3>{order.customer?.businessName || "Your business order"}</h3><p>Placed on {dateOnly(order.createdAt)}</p></div>
              <span className={`profile-status profile-status--${order.status}`}><span className="order-status-dot" />{STATUS_LABELS[order.status] || order.status}</span>
            </div>
            <OrderProducts items={order.items || []} />
            <div className="current-order__meta">
              <div><MapPin size={16} /><div><span>Service address</span><strong>{order.customer?.serviceAddress || "Not provided"}</strong></div></div>
              <div><CalendarDays size={16} /><div><span>Monthly recurring total</span><strong>{formatPrice(order.totalMonthly || 0)}/month</strong></div></div>
            </div>
            <OrderTimeline order={order} />
          </section>
        )) : <div className="order-history__empty"><PackageSearch size={24} /><strong>No active orders</strong><span>New orders will appear here after checkout.</span></div>}
      </section>

      <section className="past-orders">
        <div className="past-orders__heading"><div><h3>Past Orders</h3><p>Completed and closed orders are stored here.</p></div><span>{pastOrders.length} orders</span></div>
        {pastOrders.length ? <div className="order-history__list">{pastOrders.map((order) => <OrderCard key={order._id || order.orderNumber} order={order} expanded={expandedOrders.includes(order.orderNumber)} onToggle={() => toggleOrder(order.orderNumber)} />)}</div> : <div className="order-history__empty"><ReceiptText size={24} /><strong>No past orders yet</strong><span>Completed orders will automatically move here.</span></div>}
      </section>
    </div>
  );
}

export default OrderHistory;
