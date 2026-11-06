import { Search, X } from 'lucide-react';
import './SearchBar.scss';

function SearchBar({ value, onChange, onClear }) {
  return (
    <div className="search-bar">
      <span className="search-bar__icon" aria-hidden="true">
        <Search size={20} />
      </span>
      <input
        type="search"
        className="search-bar__input"
        placeholder="Search products, services or solutions..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search products"
      />
      {value && (
        <button
          type="button"
          className="search-bar__clear"
          onClick={onClear}
          aria-label="Clear search"
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default SearchBar;
