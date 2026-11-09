import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, LoaderCircle, PackageCheck, X,
  ShieldCheck, CreditCard, Smartphone, Landmark, Wallet, AlertTriangle,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { profileApi } from "../services/profile.api";
import { ordersApi } from "../services/orders.api";
import { formatPrice } from "../data/productCatalogue";
import "./Checkout.scss";

const emptyForm = { fullName: "", email: "", phone: "", businessName: "", serviceAddress: "" };
const paymentOptions = [
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "card", label: "Debit / Credit Card", icon: CreditCard },
  { value: "netbanking", label: "Net Banking", icon: Landmark },
  { value: "wallet", label: "Wallet", icon: Wallet },
];

function Checkout() {
  const { items, cartTotal, loading: cartLoading, clearCart } = useCart();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [blockers, setBlockers] = useState([]);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [paymentChoice, setPaymentChoice] = useState("Google Pay");
  const [placedOrder, setPlacedOrder] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    profileApi.getProfile()
      .then(({ profile }) => {
        if (!active || !profile) return;
        setForm((current) => ({
          ...current,
          fullName: profile.fullName || current.fullName,
          email: profile.email || current.email,
          phone: profile.phone || current.phone,
          businessName: profile.businessName || current.businessName,
          serviceAddress: profile.deliveryAddress || current.serviceAddress,
        }));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleContinue(event) {
    event.preventDefault();
    setError("");
    setValidating(true);
    try {
      const cartId = localStorage.getItem("accel-cart-id");
      const result = await ordersApi.validate({ cartId });
      if (!result.eligible) {
        setBlockers(result.blockers || []);
        setRequirementsOpen(true);
        return;
      }
      setPaymentOpen(true);
    } catch (requestError) {
      notify(requestError.message || "Could not check order requirements.");
    } finally {
      setValidating(false);
    }
  }

  async function simulatePayment() {
    setError("");
    setSubmitting(true);
    try {
      const cartId = localStorage.getItem("accel-cart-id");
      const result = await ordersApi.create({
        cartId,
        customer: form,
        paymentMethod: `${paymentMethod}:${paymentChoice}`,
      });
      setPlacedOrder(result.order);
      setPaymentOpen(false);
      await clearCart();
    } catch (requestError) {
      if (requestError.blockers) {
        setBlockers(requestError.blockers);
        setPaymentOpen(false);
        setRequirementsOpen(true);
      } else {
        notify(requestError.message || "Payment simulation failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (cartLoading) return <main className="checkout-page"><p className="checkout-page__loading">Loading checkout…</p></main>;

  if (placedOrder) {
    return (
      <main className="checkout-page">
        <section className="checkout-success">
          <span className="checkout-success__icon"><CheckCircle2 size={34} /></span>
          <p className="checkout-page__eyebrow">SIMULATED PAYMENT SUCCESSFUL</p>
          <h1>Your order has been placed</h1>
          <p>This is a demo payment. No money has been charged. Your order is now available to the Accel Business operations team.</p>
          <div className="checkout-success__number"><span>ORDER ID</span><strong>{placedOrder.orderNumber}</strong></div>
          <div className="checkout-success__meta"><span>{placedOrder.items?.length || 0} product(s)</span><strong>{formatPrice(placedOrder.totalMonthly || 0)}/month</strong></div>
          <button type="button" className="checkout-page__primary" onClick={() => navigate("/profile")}>View Order History</button>
          <Link to="/explore" className="checkout-success__link">Continue exploring</Link>
        </section>
      </main>
    );
  }

  if (!items.length) {
    return <main className="checkout-page"><section className="checkout-empty"><PackageCheck size={34} /><h1>Your cart is empty</h1><p>Add products before proceeding to checkout.</p><Link to="/explore">Browse products</Link></section></main>;
  }

  const PaymentIcon = paymentOptions.find((option) => option.value === paymentMethod)?.icon || CreditCard;
  const choiceOptions = {
    upi: ["Google Pay", "PhonePe", "Paytm", "BHIM UPI"],
    card: ["Visa", "Mastercard", "RuPay"],
    netbanking: ["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank"],
    wallet: ["Paytm Wallet", "Amazon Pay", "Mobikwik"],
  };

  return (
    <main className="checkout-page">
      <div className="checkout-page__container">
        <Link to="/cart" className="checkout-page__back"><ArrowLeft size={16} /> Back to cart</Link>
        <header className="checkout-page__heading">
          <p className="checkout-page__eyebrow">FINAL STEP</p>
          <h1>Complete your order</h1>
          <p>Confirm your business contact and service address before payment.</p>
        </header>

        <div className="checkout-layout">
          <form className="checkout-form" onSubmit={handleContinue}>
            <section className="checkout-panel">
              <h2>Business contact</h2>
              <div className="checkout-form__grid">
                <label>Contact person<input name="fullName" value={form.fullName} onChange={handleChange} maxLength={100} required placeholder="Full name" /></label>
                <label>Business name<input name="businessName" value={form.businessName} onChange={handleChange} maxLength={160} required placeholder="Registered or trade name" /></label>
                <label>Phone number<input name="phone" value={form.phone} onChange={handleChange} minLength={7} maxLength={20} required placeholder="Contact number" /></label>
                <label>Email address<input name="email" type="email" value={form.email} onChange={handleChange} maxLength={254} placeholder="name@business.com" /></label>
                <label className="checkout-form__full">Service / installation address<textarea name="serviceAddress" value={form.serviceAddress} onChange={handleChange} rows={3} maxLength={600} required placeholder="Where should we install or activate the services?" /></label>
              </div>
              <Link to="/profile" className="checkout-form__profile-link">Edit saved business details in Profile</Link>
            </section>
            {error && <p className="checkout-form__error" role="alert">{error}</p>}
            <button className="checkout-page__primary" type="submit" disabled={validating}>
              {validating ? <><LoaderCircle size={17} className="checkout-spin" /> Checking requirements…</> : "Continue to Payment"}
            </button>
            <p className="checkout-form__note">Your order is created only after you select “Simulate Payment”. No real payment is processed.</p>
          </form>

          <aside className="checkout-panel checkout-summary">
            <h2>Order summary</h2>
            <div className="checkout-summary__items">{items.map((item) => (
              <div className="checkout-summary__item" key={item.product_id}>
                <span><strong>{item.product_name}</strong><small>Qty {item.quantity}</small></span>
                <b>{formatPrice(item.price_min_inr_per_month * item.quantity)}/mo</b>
              </div>
            ))}</div>
            <div className="checkout-summary__total"><span>Monthly recurring total</span><strong>{formatPrice(cartTotal)}/mo</strong></div>
            <p>Payment shown here is a simulation for the hackathon demo. Your monthly service charges are not collected by this screen.</p>
          </aside>
        </div>
      </div>

      {requirementsOpen && (
        <div className="checkout-modal-backdrop" role="presentation">
          <section className="checkout-modal checkout-requirements" role="dialog" aria-modal="true" aria-labelledby="requirements-title">
            <button type="button" className="checkout-modal__close" onClick={() => setRequirementsOpen(false)} aria-label="Close"><X size={20} /></button>
            <span className="checkout-modal__icon checkout-modal__icon--warning"><AlertTriangle size={25} /></span>
            <p className="checkout-page__eyebrow">ACTION REQUIRED</p>
            <h2 id="requirements-title">A few things are needed before checkout</h2>
            <p className="checkout-modal__intro">Please resolve the following requirements. Your cart has not been changed.</p>
            <div className="checkout-blocker-list">
              {blockers.map((blocker, index) => (
                <article className="checkout-blocker" key={`${blocker.code}-${blocker.productId || index}`}>
                  <strong>{blocker.title}</strong>
                  <p>{blocker.message}</p>
                  {blocker.alternatives?.length > 0 && (
                    <div className="checkout-blocker__alternatives">
                      <span>Add at least one of these products:</span>
                      {blocker.alternatives.map((product) => <span className="checkout-blocker__product" key={product.productId}>{product.productName} ({product.productId})</span>)}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <div className="checkout-modal__actions">
              {blockers.some((item) => item.code === "UDYAM_NOT_VERIFIED" || item.code === "GSTIN_NOT_VERIFIED") && <button type="button" className="checkout-page__primary" onClick={() => navigate("/profile")}>Go to Profile & KYC</button>}
              {blockers.some((item) => item.code === "DEPENDENCY_MISSING") && <button type="button" className="checkout-modal__secondary" onClick={() => navigate("/explore")}>Browse required products</button>}
              <button type="button" className="checkout-modal__text-button" onClick={() => setRequirementsOpen(false)}>Review my cart</button>
            </div>
          </section>
        </div>
      )}

      {paymentOpen && (
        <div className="checkout-modal-backdrop" role="presentation">
          <section className="checkout-modal checkout-payment" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <button type="button" className="checkout-modal__close" onClick={() => setPaymentOpen(false)} aria-label="Close"><X size={20} /></button>
            <div className="checkout-payment__brand"><span><ShieldCheck size={23} /></span><div><strong>Accel Business</strong><small>Secure demo checkout</small></div></div>
            <p className="checkout-page__eyebrow">PAYMENT SIMULATION</p>
            <h2 id="payment-title">Choose a payment method</h2>
            <p className="checkout-modal__intro">Select any option below. This is a simulated payment and will not charge you.</p>
            <div className="checkout-payment__amount"><span>Monthly recurring total</span><strong>{formatPrice(cartTotal)}<small>/month</small></strong></div>
            <label className="checkout-payment__label" htmlFor="payment-method">Payment method</label>
            <div className="checkout-payment__method-grid">
              {paymentOptions.map(({ value, label, icon: Icon }) => (
                <button type="button" key={value} className={`checkout-payment__method ${paymentMethod === value ? "is-selected" : ""}`} onClick={() => { setPaymentMethod(value); setPaymentChoice(choiceOptions[value][0]); }}>
                  <Icon size={19} /><span>{label}</span>
                </button>
              ))}
            </div>
            <label className="checkout-payment__label" htmlFor="payment-choice">{paymentMethod === "upi" ? "Choose UPI app" : paymentMethod === "card" ? "Card network" : paymentMethod === "netbanking" ? "Select your bank" : "Choose wallet"}</label>
            <select id="payment-choice" value={paymentChoice} onChange={(event) => setPaymentChoice(event.target.value)}>
              {choiceOptions[paymentMethod].map((choice) => <option key={choice} value={choice}>{choice}</option>)}
            </select>
            <div className="checkout-payment__demo-note"><ShieldCheck size={16} /><span>Demo only — no card, UPI PIN, password or banking credentials are requested.</span></div>
            <button type="button" className="checkout-page__primary checkout-payment__simulate" onClick={simulatePayment} disabled={submitting}>
              {submitting ? <><LoaderCircle size={17} className="checkout-spin" /> Simulating payment…</> : <><PaymentIcon size={18} /> Simulate Payment</>}
            </button>
            <button type="button" className="checkout-modal__text-button" onClick={() => setPaymentOpen(false)} disabled={submitting}>Back to checkout</button>
          </section>
        </div>
      )}

      {toast && <div className="checkout-toast" role="status">{toast}</div>}
    </main>
  );
}

export default Checkout;
