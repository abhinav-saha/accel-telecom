const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}/api/profile${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return payload;
}

export const profileApi = {
  getProfile: () => request("/business"),
  updateProfile: (data) => request("/business", { method: "PUT", body: JSON.stringify(data) }),
  getBundles: () => request("/bundles"),
  saveBundle: (bundle) => request("/bundles", { method: "POST", body: JSON.stringify(bundle) }),
  deleteBundle: (id) => request(`/bundles/${id}`, { method: "DELETE" }),
  getActiveProducts: () => request("/active-products"),
  getOrders: () => request("/orders"),
  getKyc: () => request("/kyc"),
  saveKycConsent: (data) => request("/kyc/consent", { method: "POST", body: JSON.stringify(data) }),
  withdrawKycConsent: () => request("/kyc/consent", { method: "DELETE" }),
  uploadKyc: (type, file) => {
    const body = new FormData();
    body.append("document", file);
    return request(`/kyc/${type}`, { method: "POST", body });
  },
  getKycFile: async (id) => {
    const response = await fetch(`${API_URL}/api/profile/kyc/${id}/file`, { credentials: "include" });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Unable to open this document");
    }
    return response.blob();
  },
};

export async function signOut() {
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Sign out failed. Please try again.");
}
