import { CheckCircle, X } from "lucide-react";
import { useCart } from "../context/CartContext";
import "./Toast.scss";

function Toast() {
  const { toast, dismissToast } = useCart();

  if (!toast) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast__icon" aria-hidden="true">
        <CheckCircle size={18} />
      </span>
      <span className="toast__message">{toast}</span>
      <button
        type="button"
        className="toast__close"
        onClick={dismissToast}
        aria-label="Dismiss notification"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default Toast;
