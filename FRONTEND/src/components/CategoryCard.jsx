import { Wifi, PhoneCall, Cloud, ShieldCheck, Cctv } from 'lucide-react';
import { categoryIcons } from '../data/productCatalogue';
import './CategoryCard.scss';

const iconMap = {
  Wifi,
  PhoneCall,
  Cloud,
  ShieldCheck,
  Cctv,
};

function CategoryCard({ category }) {
  const iconName = categoryIcons[category.name];
  const Icon = iconMap[iconName] ?? Cloud;

  return (
    <article className="category-card">
      <span className="category-card__icon" aria-hidden="true">
        <Icon size={26} strokeWidth={2} />
      </span>
      <h3 className="category-card__name">{category.name}</h3>
      <p className="category-card__description">{category.description}</p>
      <span className="category-card__count">
        {category.count} {category.count === 1 ? 'product' : 'products'}
      </span>
    </article>
  );
}

export default CategoryCard;
