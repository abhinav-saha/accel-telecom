import { SlidersHorizontal, RotateCcw } from "lucide-react";
import "./ProductFilters.scss";

const sortOptions = [
  { value: "recommended", label: "Recommended" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

const segmentLabels = {
  micro: "Micro Business",
  prof: "Professional",
  multi: "Multi-site / Enterprise",
  mfg: "Manufacturing",
};

function ProductFilters({
  sort,
  onSortChange,
  maxPrice,
  priceRange,
  onPriceRangeChange,
  segments,
  selectedSegment,
  onSegmentChange,
  onReset,
}) {
  return (
    <div className="product-filters">
      <div className="product-filters__group">
        <span className="product-filters__label" aria-hidden="true">
          <SlidersHorizontal size={15} />
          Sort
        </span>
        <select
          className="product-filters__select"
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
          aria-label="Sort products"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="product-filters__group">
        <label className="product-filters__label" htmlFor="price-range">
          Max price: ₹{Number(priceRange).toLocaleString("en-IN")}/mo
        </label>
        <input
          id="price-range"
          type="range"
          className="product-filters__range"
          min={0}
          max={maxPrice}
          step={500}
          value={priceRange}
          onChange={(event) => onPriceRangeChange(Number(event.target.value))}
          aria-label="Maximum monthly price"
        />
      </div>

      <div className="product-filters__group">
        <span className="product-filters__label">Segment</span>
        <select
          className="product-filters__select"
          value={selectedSegment}
          onChange={(event) => onSegmentChange(event.target.value)}
          aria-label="Filter by business segment"
        >
          <option value="all">All Segments</option>
          {segments.map((segment) => (
            <option key={segment} value={segment}>
              {segmentLabels[segment] ?? segment}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="product-filters__reset"
        onClick={onReset}
      >
        <RotateCcw size={15} aria-hidden="true" />
        Reset
      </button>
    </div>
  );
}

export default ProductFilters;
