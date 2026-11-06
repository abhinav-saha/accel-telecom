import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
import "./Placeholder.scss";

function CheckoutPlaceholder() {
  return (
    <div className="placeholder">
      <span className="placeholder__icon" aria-hidden="true">
        <CreditCard size={40} strokeWidth={1.5} />
      </span>
      <h1 className="placeholder__title">Checkout</h1>
      <p className="placeholder__message">Checkout will be available soon.</p>
      <Link to="/cart" className="placeholder__link">
        Back to Cart
      </Link>
    </div>
  );
}

export default CheckoutPlaceholder;
