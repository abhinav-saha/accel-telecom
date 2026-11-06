import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatPrice } from "../data/productCatalogue";
import { useCart } from "../context/CartContext";
import "./CartSummary.scss";

function CartSummary() {
  const { itemCount, cartTotal } = useCart();
  const navigate = useNavigate();

  return (
    <aside className="cart-summary" aria-labelledby="cart-summary-title">
      <h2 className="cart-summary__title" id="cart-summary-title">
        Order Summary
      </h2>

      <dl className="cart-summary__rows">
        <div className="cart-summary__row">
          <dt>Items</dt>
          <dd>{itemCount}</dd>
        </div>
        <div className="cart-summary__row">
          <dt>Subtotal</dt>
          <dd>{formatPrice(cartTotal)}/month</dd>
        </div>
      </dl>

      <div className="cart-summary__total">
        <span className="cart-summary__total-label">Monthly recurring total</span>
        <span className="cart-summary__total-value">
          {formatPrice(cartTotal)}
          <span className="cart-summary__total-unit">/month</span>
        </span>
      </div>

      <p className="cart-summary__note">
        All prices are monthly recurring charges. Totals use the starting
        monthly price of each product.
      </p>

      <div className="cart-summary__actions">
        <button
          type="button"
          className="cart-summary__checkout"
          onClick={() => navigate("/checkout")}
        >
          Proceed to Checkout
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <Link to="/explore" className="cart-summary__continue">
          Continue Shopping
        </Link>
      </div>
    </aside>
  );
}

export default CartSummary;
