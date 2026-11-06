
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong");
    }

    return data;
}

export const getCartAPI = (cartId) => {
    return request(`/api/cart/${cartId}`);
};

export const addToCartAPI = (cartId, product) => {
    return request(`/api/cart/${cartId}/items`, {
        method: "POST",
        body: JSON.stringify(product)
    });
};

export const updateQuantityAPI = (cartId, productId, quantity) => {
    return request(`/api/cart/${cartId}/items/${productId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity })
    });
};

export const removeFromCartAPI = (cartId, productId) => {
    return request(`/api/cart/${cartId}/items/${productId}`, {
        method: "DELETE"
    });
};

export const clearCartAPI = (cartId) => {
    return request(`/api/cart/${cartId}`, {
        method: "DELETE"
    });
};
