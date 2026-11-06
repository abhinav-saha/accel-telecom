
import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef
} from "react";

import {
    getCartAPI,
    addToCartAPI,
    updateQuantityAPI,
    removeFromCartAPI,
    clearCartAPI
} from "../services/cart.api";

const CartContext = createContext(null);

const CART_ID_KEY = "accel-cart-id";

function getCartId() {
    let cartId = localStorage.getItem(CART_ID_KEY);

    if (!cartId) {
        cartId = crypto.randomUUID();
        localStorage.setItem(CART_ID_KEY, cartId);
    }

    return cartId;
}

function CartProvider({ children }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    const toastTimer = useRef(null);
    const cartId = useRef(null);

    const showToast = useCallback((message) => {
        setToast(message);

        if (toastTimer.current) {
            clearTimeout(toastTimer.current);
        }

<<<<<<< HEAD
        toastTimer.current = setTimeout(() => {
            setToast(null);
        }, 2800);
    }, []);
=======
  const removeFromCart = useCallback(
    (productId) => {
      const removed = items.find((item) => item.product_id === productId);
      setItems((prev) => prev.filter((item) => item.product_id !== productId));
      if (removed) showToast(`${removed.product_name} removed from cart`);
    },
    [items, showToast],
  );
>>>>>>> a2df8c4258118dad89e34666457af3bf76c8d31f

    // Fetch cart when application starts
    useEffect(() => {
        let active = true;

        const initializeCart = async () => {
            try {
                cartId.current = getCartId();

                const cart = await getCartAPI(cartId.current);

                if (active) {
                    setItems(cart.items || []);
                }
            } catch (error) {
                if (active) {
                    showToast("Unable to load your cart");
                    console.error("Cart loading failed:", error);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        initializeCart();

        return () => {
            active = false;
        };
    }, [showToast]);

    // Add product
    const addToCart = useCallback(async (product) => {
        try {
            const data = await addToCartAPI(
                cartId.current,
                product
            );

            setItems(data.cart.items);

            showToast(`${product.product_name} added to cart`);
        } catch (error) {
            showToast("Unable to add product");
            console.error("Add to cart failed:", error);
        }
    }, [showToast]);

    // Update quantity
    const updateQuantity = useCallback(async (productId, quantity) => {
        const newQuantity = Math.max(1, quantity);

        try {
            const data = await updateQuantityAPI(
                cartId.current,
                productId,
                newQuantity
            );

            setItems(data.cart.items);
        } catch (error) {
            showToast("Unable to update quantity");
            console.error("Quantity update failed:", error);
        }
    }, [showToast]);

    // Remove product
    const removeFromCart = useCallback(async (productId) => {
        try {
            const data = await removeFromCartAPI(
                cartId.current,
                productId
            );

            setItems(data.cart.items);

            showToast("Product removed from cart");
        } catch (error) {
            showToast("Unable to remove product");
            console.error("Remove product failed:", error);
        }
    }, [showToast]);

    // Clear cart
    const clearCart = useCallback(async () => {
        try {
            const data = await clearCartAPI(cartId.current);

            setItems(data.cart.items);

            showToast("Cart cleared");
        } catch (error) {
            showToast("Unable to clear cart");
            console.error("Clear cart failed:", error);
        }
    }, [showToast]);

    const itemCount = items.reduce(
        (total, item) => total + item.quantity,
        0
    );

    const cartTotal = items.reduce(
        (total, item) =>
            total + item.price_min_inr_per_month * item.quantity,
        0
    );

    const value = {
        items,
        itemCount,
        cartTotal,
        loading,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        toast,
        dismissToast: () => setToast(null)
    };

<<<<<<< HEAD
    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
=======
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
>>>>>>> a2df8c4258118dad89e34666457af3bf76c8d31f
}

function useCart() {
    const context = useContext(CartContext);

    if (!context) {
        throw new Error("useCart must be used within a CartProvider");
    }

    return context;
}

export { CartProvider, useCart };
