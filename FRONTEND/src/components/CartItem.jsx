import { Minus, Plus, Trash2 } from "lucide-react";
import { formatPrice } from "../data/productCatalogue";
import { useCart } from "../context/CartContext";
import "./CartItem.scss";

function CartItem({ item }) {
  const { updateQuantity, removeFromCart } = useCart();
  const { product_id, product_name, category, description, unit } = item;
  const isRange = item.price_min_inr_per_month !== item.price_max_inr_per_month;
  const monthlyPrice = item.price_min_inr_per_month;
  const subtotal = monthlyPrice * item.quantity;
  const priceLabel = isRange
    ? `from ${formatPrice(monthlyPrice)}`
    : formatPrice(monthlyPrice);

  return (
    <article className="cart-item">
      <div className="cart-item__info">
        <span className="cart-item__category">
          {category}
        </span>
        <h2 className="cart-item__name">{product_name}</h2>
        <p className="cart-item__description">{description}</p>
      </div>

      <div className="cart-item__controls">
        <div className="cart-item__price">
          <span className="cart-item__label">Monthly price</span>
          <span className="cart-item__price-value">
            {priceLabel}
            <span className="cart-item__unit">/month per {unit}</span>
          </span>
        </div>

        <div className="cart-item__quantity">
          <span className="cart-item__label">Quantity</span>
          <div className="cart-item__stepper">
            <button
              type="button"
              className="cart-item__step"
              onClick={() => updateQuantity(product_id, item.quantity - 1)}
              disabled={item.quantity <= 1}
              aria-label={`Decrease quantity of ${product_name}`}
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <span className="cart-item__count" aria-live="polite">
              {item.quantity}
            </span>
            <button
              type="button"
              className="cart-item__step"
              onClick={() => updateQuantity(product_id, item.quantity + 1)}
              aria-label={`Increase quantity of ${product_name}`}
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="cart-item__subtotal">
          <span className="cart-item__label">Subtotal</span>
          <span className="cart-item__subtotal-value">
            {formatPrice(subtotal)}
            <span className="cart-item__unit">/month</span>
          </span>
        </div>

        <button
          type="button"
          className="cart-item__remove"
          onClick={() => removeFromCart(product_id)}
          aria-label={`Remove ${product_name} from cart`}
        >
          <Trash2 size={16} aria-hidden="true" />
          <span>Remove</span>
        </button>
      </div>
    </article>
  );
}

export default CartItem;
