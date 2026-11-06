import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShoppingCart,
  Wifi,
  PhoneCall,
  Cloud,
  ShieldCheck,
  Cctv,
  Target,
} from 'lucide-react';
import {
  formatPrice,
  formatPriceRange,
  categoryIcons,
} from '../data/productCatalogue';
import { useCart } from '../context/CartContext';
import './ProductCard.scss';

const iconMap = {
  Wifi,
  PhoneCall,
  Cloud,
  ShieldCheck,
  Cctv,
};

const segmentLabels = {
  micro: 'Micro',
  prof: 'Professional',
  multi: 'Multi-site',
  mfg: 'Manufacturing',
};

function ProductCard({ product, onViewDetails }) {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const iconName = categoryIcons[product.category];
  const Icon = iconMap[iconName] ?? Cloud;

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(product);
    } else {
      navigate('/explore');
    }
  };

  const handleAddToCart = () => {
    addToCart(product);
  };

  const setupFee = product.one_time_setup_inr;
  const contractMonths = product.min_contract_months;
  const installDays = product.typical_install_days;

  return (
    <article className="product-card">
      <div className="product-card__top">
        <span className="product-card__category-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className="product-card__category">{product.category}</span>
      </div>

      <h3 className="product-card__name">{product.product_name}</h3>
      <p className="product-card__description">{product.description}</p>

      <div className="product-card__pricing">
        <div className="product-card__price-block">
          <span className="product-card__price-label">Monthly price</span>
          <span className="product-card__price-value">
            {formatPriceRange(
              product.price_min_inr_per_month,
              product.price_max_inr_per_month,
            )}
            <span className="product-card__price-unit">/mo</span>
          </span>
        </div>
        <span className="product-card__billing-unit">per {product.unit}</span>
      </div>

      <ul className="product-card__meta">
        <li className="product-card__meta-item">
          <span className="product-card__meta-label">Setup fee</span>
          <span
            className={`product-card__meta-value ${
              setupFee === 0 ? 'product-card__meta-value--success' : ''
            }`}
          >
            {setupFee > 0 ? formatPrice(setupFee) : 'Free'}
          </span>
        </li>
        <li className="product-card__meta-item">
          <span className="product-card__meta-label">Min. contract</span>
          <span className="product-card__meta-value">
            {contractMonths} {contractMonths === 1 ? 'mo' : 'mos'}
          </span>
        </li>
        <li className="product-card__meta-item">
          <span className="product-card__meta-label">Installation</span>
          <span className="product-card__meta-value">
            {installDays} {installDays === 1 ? 'day' : 'days'}
          </span>
        </li>
      </ul>

      <div className="product-card__segments">
        <Target size={13} aria-hidden="true" />
        {product.target_segments.map((segment) => (
          <span key={segment} className="product-card__segment-tag">
            {segmentLabels[segment] ?? segment}
          </span>
        ))}
      </div>

      <div className="product-card__actions">
        <button
          type="button"
          className="product-card__action product-card__action--secondary"
          onClick={handleViewDetails}
        >
          View Details
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="product-card__action product-card__action--primary"
          onClick={handleAddToCart}
        >
          <ShoppingCart size={16} aria-hidden="true" />
          Add to Cart
        </button>
      </div>
    </article>
  );
}

export default ProductCard;
