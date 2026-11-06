import { useEffect } from "react";
import {
  X,
  ShoppingCart,
  Building2,
  Users,
  MapPin,
  FileText,
  Link2,
  Clock,
  Tag,
  Layers,
  IndianRupee,
  Calendar,
  Target,
} from "lucide-react";
import {
  formatPrice,
  formatPriceRange,
  getProductNamesByIds,
} from "../data/productCatalogue";
import { useCart } from "../context/CartContext";
import "./ProductDetailsModal.scss";

const segmentLabels = {
  micro: "Micro Business",
  prof: "Professional",
  multi: "Multi-site / Enterprise",
  mfg: "Manufacturing",
};

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="modal-details__row">
      <span className="modal-details__icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="modal-details__label">{label}</span>
      <span className="modal-details__value">{children}</span>
    </div>
  );
}

function ProductDetailsModal({ product, onClose }) {
  const { addToCart } = useCart();

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!product) return null;

  const dependencyNames = getProductNamesByIds(product.requires_one_of);
  const tierLabels = product.available_city_tiers.map((tier) => `Tier ${tier}`);

  const handleAddToCart = () => {
    addToCart(product);
    onClose();
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal">
        <div className="modal__header">
          <div className="modal__header-text">
            <span className="modal__category-badge">{product.category}</span>
            <h2 className="modal__title" id="modal-title">
              {product.product_name}
            </h2>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close product details"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal__body">
          <p className="modal__description">{product.description}</p>

          <div className="modal__pricing">
            <div className="modal__pricing-item">
              <span className="modal__pricing-label">Monthly price</span>
              <span className="modal__pricing-value">
                {formatPriceRange(
                  product.price_min_inr_per_month,
                  product.price_max_inr_per_month,
                )}
              </span>
              <span className="modal__pricing-unit">per {product.unit}</span>
            </div>
            <div className="modal__pricing-item">
              <span className="modal__pricing-label">Setup fee</span>
              <span className="modal__pricing-value">
                {product.one_time_setup_inr > 0
                  ? formatPrice(product.one_time_setup_inr)
                  : "Free"}
              </span>
            </div>
            <div className="modal__pricing-item">
              <span className="modal__pricing-label">Min. contract</span>
              <span className="modal__pricing-value">
                {product.min_contract_months}{" "}
                {product.min_contract_months === 1 ? "month" : "months"}
              </span>
            </div>
          </div>

          <div className="modal-details">
            <h3 className="modal-details__heading">
              Eligibility & Requirements
            </h3>
            <DetailRow icon={Layers} label="Category">
              {product.category}
            </DetailRow>
            <DetailRow icon={IndianRupee} label="Billing unit">
              per {product.unit}
            </DetailRow>
            <DetailRow icon={MapPin} label="Available city tiers">
              {tierLabels.length > 0 ? tierLabels.join(", ") : "All tiers"}
            </DetailRow>
            <DetailRow icon={Users} label="Min. employees">
              {product.min_employees}
            </DetailRow>
            <DetailRow icon={Building2} label="Min. sites">
              {product.min_sites}
            </DetailRow>
            <DetailRow icon={FileText} label="GSTIN required">
              {product.requires_gstin ? "Yes" : "No"}
            </DetailRow>
            <DetailRow icon={Link2} label="Product dependencies">
              {dependencyNames.length > 0 ? dependencyNames.join(", ") : "None"}
            </DetailRow>
            <DetailRow icon={Clock} label="Typical installation">
              {product.typical_install_days} days
            </DetailRow>
            <DetailRow icon={Calendar} label="Min. contract">
              {product.min_contract_months}{" "}
              {product.min_contract_months === 1 ? "month" : "months"}
            </DetailRow>
            <DetailRow icon={Target} label="Target segments">
              {product.target_segments
                .map((segment) => segmentLabels[segment] ?? segment)
                .join(", ")}
            </DetailRow>
          </div>
        </div>

        <div className="modal__footer">
          <button
            type="button"
            className="modal__action modal__action--primary"
            onClick={handleAddToCart}
          >
            <ShoppingCart size={18} aria-hidden="true" />
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailsModal;
