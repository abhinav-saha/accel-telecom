const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TOKEN_KEY = "accel-admin-token";

async function request(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Admin request failed.");
  return data;
}

export const adminApi = {
  login: async (email, password) => {
    const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    sessionStorage.setItem(TOKEN_KEY, result.token);
    return result.admin;
  },
  logout: () => sessionStorage.removeItem(TOKEN_KEY),
  isLoggedIn: () => Boolean(sessionStorage.getItem(TOKEN_KEY)),
  getOrders: () => request("/orders"),
  updateOrder: (orderNumber, payload) => request(`/orders/${encodeURIComponent(orderNumber)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),
};
