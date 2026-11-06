import { useState, useMemo } from "react";
import { SearchX, RotateCcw } from "lucide-react";
import SearchBar from "../components/SearchBar";
import CategoryTabs from "../components/CategoryTabs";
import ProductFilters from "../components/ProductFilters";
import ProductCard from "../components/ProductCard";
import ProductDetailsModal from "../components/ProductDetailsModal";
import {
  products,
  categoryList,
  allSegments,
  priceBounds,
} from "../data/productCatalogue";
import "./Explore.scss";

const ALL_CATEGORY = "All";

function Explore() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [sortBy, setSortBy] = useState("recommended");
  const [maxPrice, setMaxPrice] = useState(priceBounds.max);
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleClearSearch = () => setSearchQuery("");

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCategory(ALL_CATEGORY);
    setSortBy("recommended");
    setMaxPrice(priceBounds.max);
    setSelectedSegment("all");
  };

  const isDefaultState =
    searchQuery === "" &&
    selectedCategory === ALL_CATEGORY &&
    sortBy === "recommended" &&
    maxPrice === priceBounds.max &&
    selectedSegment === "all";

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (selectedCategory !== ALL_CATEGORY) {
      result = result.filter(
        (product) => product.category === selectedCategory,
      );
    }

    if (selectedSegment !== "all") {
      result = result.filter((product) =>
        product.target_segments.includes(selectedSegment),
      );
    }

    if (maxPrice < priceBounds.max) {
      result = result.filter(
        (product) => product.price_min_inr_per_month <= maxPrice,
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((product) => {
        const inName = product.product_name.toLowerCase().includes(query);
        const inDescription = product.description.toLowerCase().includes(query);
        const inCategory = product.category.toLowerCase().includes(query);
        return inName || inDescription || inCategory;
      });
    }

    if (sortBy === "price-asc") {
      result.sort(
        (a, b) => a.price_min_inr_per_month - b.price_min_inr_per_month,
      );
    } else if (sortBy === "price-desc") {
      result.sort(
        (a, b) => b.price_min_inr_per_month - a.price_min_inr_per_month,
      );
    }

    return result;
  }, [searchQuery, selectedCategory, sortBy, maxPrice, selectedSegment]);

  const resultCount = filteredProducts.length;

  return (
    <main className="explore" id="explore-page">
      <div className="explore__container">
        <header className="explore__header">
          <div className="explore__header-text">
            <h1 className="explore__title">Explore Business Solutions</h1>
            <p className="explore__subtitle">
              Find the right digital services to power your business.
            </p>
          </div>
          <span className="explore__count">
            {products.length} Products Available
          </span>
        </header>

        <div className="explore__search">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={handleClearSearch}
          />
        </div>

        <div className="explore__categories">
          <CategoryTabs
            categories={categoryList}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        </div>

        <div className="explore__filters">
          <ProductFilters
            sort={sortBy}
            onSortChange={setSortBy}
            maxPrice={priceBounds.max}
            priceRange={maxPrice}
            onPriceRangeChange={setMaxPrice}
            segments={allSegments}
            selectedSegment={selectedSegment}
            onSegmentChange={setSelectedSegment}
            onReset={handleResetFilters}
          />
        </div>

        <div className="explore__results-bar">
          <span className="explore__results-count">
            {resultCount} {resultCount === 1 ? "product" : "products"} found
          </span>
          {!isDefaultState && (
            <button
              type="button"
              className="explore__reset-link"
              onClick={handleResetFilters}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset filters
            </button>
          )}
        </div>

        {resultCount > 0 ? (
          <div className="explore__grid">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.product_id}
                product={product}
                onViewDetails={setSelectedProduct}
              />
            ))}
          </div>
        ) : (
          <div className="explore__empty">
            <span className="explore__empty-icon" aria-hidden="true">
              <SearchX size={44} strokeWidth={1.5} />
            </span>
            <h2 className="explore__empty-title">No products found.</h2>
            <p className="explore__empty-message">
              Try adjusting your search or filters.
            </p>
            <button
              type="button"
              className="explore__empty-reset"
              onClick={handleResetFilters}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </main>
  );
}

export default Explore;
