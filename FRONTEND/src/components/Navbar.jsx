import { NavLink, Link } from "react-router-dom";
import { Zap, Home, Compass, Sparkles, ShoppingCart, User } from "lucide-react";
import { mockUser } from "../data/mockUser";
import { useCart } from "../context/CartContext";
import "./Navbar.scss";

const navLinks = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/explore", label: "Explore", icon: Compass, exact: false },
  { to: "/for-you", label: "For You", icon: Sparkles, exact: false },
];

function Navbar() {
  const { itemCount } = useCart();

  return (
    <header className="navbar" role="banner">
      <div className="navbar__inner">
        <Link to="/" className="navbar__brand" aria-label="Accel Business home">
          <span className="navbar__logo" aria-hidden="true">
            <Zap size={22} strokeWidth={2.5} />
          </span>
          <span className="navbar__brand-name">Accel Business</span>
        </Link>

        <nav className="navbar__nav" aria-label="Primary navigation">
          <ul className="navbar__tabs">
            {navLinks.map(({ to, label, icon: Icon, exact }) => (
              <li className="navbar__tab-item" key={to}>
                <NavLink
                  to={to}
                  className="navbar__tab"
                  end={exact}
                  aria-label={label}
                >
                  <Icon
                    size={18}
                    className="navbar__tab-icon"
                    aria-hidden="true"
                  />
                  <span className="navbar__tab-label">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="navbar__right">
          <Link
            to="/cart"
            className="navbar__cart"
            aria-label={`Cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
          >
            <ShoppingCart size={20} aria-hidden="true" />
            {itemCount > 0 && (
              <span className="navbar__cart-badge">{itemCount}</span>
            )}
          </Link>
          <Link
            to="/profile"
            className="navbar__profile"
            aria-label="View profile"
          >
            <span className="navbar__avatar" aria-hidden="true">
              {mockUser.avatarInitials}
            </span>
            <User
              size={16}
              className="navbar__profile-icon"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
