const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}/api/orders${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Order request failed.");
    error.blockers = data.blockers;
    throw error;
  }
  return data;
}

export const ordersApi = {
  validate: (payload) => request("/validate", { method: "POST", body: JSON.stringify(payload) }),
  create: (payload) => request("/", { method: "POST", body: JSON.stringify(payload) }),
  getMine: () => request("/mine"),
};
