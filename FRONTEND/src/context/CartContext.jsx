import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "accel-cart";

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota errors */
    }
  }, [items]);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const addToCart = useCallback(
    (product) => {
      setItems((prev) => {
        const existing = prev.find(
          (item) => item.product_id === product.product_id,
        );
        if (existing) {
          return prev.map((item) =>
            item.product_id === product.product_id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        }
        return [...prev, { ...product, quantity: 1 }];
      });
      showToast(`${product.product_name} added to cart`);
    },
    [showToast],
  );

  const removeFromCart = useCallback(
    (productId) => {
      const removed = items.find((item) => item.product_id === productId);
      setItems((prev) => prev.filter((item) => item.product_id !== productId));
      if (removed) showToast(`${removed.product_name} removed from cart`);
    },
    [items, showToast],
  );

  const updateQuantity = useCallback((productId, quantity) => {
    setItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: Math.max(1, quantity) }
          : item,
      ),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

  const cartTotal = items.reduce(
    (total, item) => total + item.price_min_inr_per_month * item.quantity,
    0,
  );

  const value = {
    items,
    itemCount,
    cartTotal,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    toast,
    dismissToast: () => setToast(null),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

export { CartProvider, useCart };
