import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, PencilLine } from "lucide-react";
import { formatPrice } from "../data/productCatalogue";
import { useCart } from "../context/CartContext";
import { profileApi } from "../services/profile.api";
import "./CartSummary.scss";

function CartSummary() {
  const { itemCount, cartTotal } = useCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [addressLoading, setAddressLoading] = useState(true);

  useEffect(() => {
    let active = true;
    profileApi.getProfile()
      .then(({ profile }) => { if (active) setAddress(profile?.deliveryAddress || ""); })
      .catch(() => { if (active) setAddress(""); })
      .finally(() => { if (active) setAddressLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <aside className="cart-summary" aria-labelledby="cart-summary-title">
      <h2 className="cart-summary__title" id="cart-summary-title">Order Summary</h2>
      <dl className="cart-summary__rows">
        <div className="cart-summary__row"><dt>Items</dt><dd>{itemCount}</dd></div>
        <div className="cart-summary__row"><dt>Subtotal</dt><dd>{formatPrice(cartTotal)}/month</dd></div>
      </dl>
      <div className="cart-summary__total">
        <span className="cart-summary__total-label">Monthly recurring total</span>
        <span className="cart-summary__total-value">{formatPrice(cartTotal)}<span className="cart-summary__total-unit">/month</span></span>
      </div>

      <section className="cart-summary__address" aria-label="Service address">
        <div className="cart-summary__address-heading"><MapPin size={17} /><strong>Service address</strong></div>
        <p>{addressLoading ? "Loading saved address…" : address || "No service address saved yet."}</p>
        <Link to="/profile" className="cart-summary__address-edit">
          <PencilLine size={14} /> {address ? "Edit in Profile" : "Add address in Profile"}
        </Link>
      </section>

      <p className="cart-summary__note">All prices are monthly recurring charges. Totals use the starting monthly price of each product.</p>
      <div className="cart-summary__actions">
        <button type="button" className="cart-summary__checkout" onClick={() => navigate("/checkout")}>Proceed to Checkout <ArrowRight size={16} aria-hidden="true" /></button>
        <Link to="/explore" className="cart-summary__continue">Continue Shopping</Link>
      </div>
    </aside>
  );
}

export default CartSummary;
