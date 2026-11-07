const BusinessProfile = require("../models/businessProfile.model");
const Order = require("../models/order.model");

// Call this from your authenticated checkout controller AFTER validating the cart
// and calculating prices from your server-side product catalogue.
async function createOrderForUser({ userId, orderNumber, items, totalMonthly, status = "Pending" }) {
  if (!userId || !orderNumber || !Array.isArray(items) || items.length === 0) {
    throw new Error("userId, orderNumber and at least one order item are required.");
  }
  const safeItems = items.map((item) => ({
    productId: String(item.productId),
    productName: String(item.productName),
    quantity: Math.max(1, Number(item.quantity) || 1),
    monthlyPrice: Math.max(0, Number(item.monthlyPrice) || 0),
  }));
  return Order.create({ userId, orderNumber, items: safeItems, totalMonthly: Math.max(0, Number(totalMonthly) || 0), status });
}

// Call this only after the operator confirms actual service activation.
async function activateProductForUser({ userId, productId, productName, description = "", activatedAt = new Date(), expiresAt }) {
  if (!userId || !productName) throw new Error("userId and productName are required.");
  return BusinessProfile.findOneAndUpdate(
    { userId },
    { $push: { activeProducts: { productId: productId ? String(productId) : "", productName: String(productName), description: String(description), activatedAt, expiresAt: expiresAt || null, status: "Active" } }, $setOnInsert: { userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

module.exports = { createOrderForUser, activateProductForUser };
