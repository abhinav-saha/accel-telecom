import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import "./Placeholder.scss";

function ForYouPlaceholder() {
  return (
    <div className="placeholder">
      <span className="placeholder__icon" aria-hidden="true">
        <Sparkles size={40} strokeWidth={1.5} />
      </span>
      <h1 className="placeholder__title">For You</h1>
      <p className="placeholder__message">Coming soon</p>
      <Link to="/" className="placeholder__link">
        Back to Home
      </Link>
    </div>
  );
}

export default ForYouPlaceholder;
