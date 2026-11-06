import { Link } from "react-router-dom";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "../context/CartContext";
import CartItem from "../components/CartItem";
import CartSummary from "../components/CartSummary";
import "./Cart.scss";

function Cart() {
<<<<<<< HEAD
  const { items, itemCount, loading } = useCart();

  if (loading) {
    return (
      <main className="cart" id="cart-page">
        <div className="cart__container">
          <p>Loading your cart...</p>
        </div>
      </main>
    );
  }
=======
  const { items, itemCount } = useCart();
>>>>>>> a2df8c4258118dad89e34666457af3bf76c8d31f

  if (items.length === 0) {
    return (
      <main className="cart" id="cart-page">
        <div className="cart__container">
          <div className="cart__empty">
            <span className="cart__empty-icon" aria-hidden="true">
              <ShoppingCart size={44} strokeWidth={1.5} />
            </span>
<<<<<<< HEAD

            <h1 className="cart__empty-title">Your cart is empty</h1>

=======
            <h1 className="cart__empty-title">Your cart is empty</h1>
>>>>>>> a2df8c4258118dad89e34666457af3bf76c8d31f
            <p className="cart__empty-message">
              Explore our business solutions and find the right products for
              your business.
            </p>
<<<<<<< HEAD

=======
>>>>>>> a2df8c4258118dad89e34666457af3bf76c8d31f
            <Link to="/explore" className="cart__empty-cta">
              Browse Products
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="cart" id="cart-page">
      <div className="cart__container">
        <header className="cart__header">
          <h1 className="cart__title">Your Cart</h1>
<<<<<<< HEAD

=======
>>>>>>> a2df8c4258118dad89e34666457af3bf76c8d31f
          <p className="cart__subtitle">
            {itemCount} {itemCount === 1 ? "item" : "items"} in your cart
          </p>
        </header>

        <div className="cart__layout">
          <ul className="cart__items" aria-label="Cart items">
            {items.map((item) => (
              <li key={item.product_id}>
                <CartItem item={item} />
              </li>
            ))}
          </ul>

          <CartSummary />
        </div>
      </div>
    </main>
  );
}

export default Cart;
