import "./CategoryTabs.scss";

function CategoryTabs({ categories, selected, onSelect }) {
  return (
    <nav className="category-tabs" aria-label="Product categories">
      <div className="category-tabs__scroll">
        <button
          type="button"
          className={`category-tabs__tab ${
            selected === "All" ? "category-tabs__tab--active" : ""
          }`}
          onClick={() => onSelect("All")}
        >
          All Products
        </button>
        {categories.map((category) => (
          <button
            type="button"
            key={category}
            className={`category-tabs__tab ${
              selected === category ? "category-tabs__tab--active" : ""
            }`}
            onClick={() => onSelect(category)}
          >
            {category}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default CategoryTabs;
