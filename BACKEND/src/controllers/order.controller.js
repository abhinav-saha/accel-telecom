const crypto = require("crypto");
const mongoose = require("mongoose");
const Cart = require("../models/cart.model");
const Order = require("../models/order.model");
const { getOrderRequirements } = require("../services/orderRequirements.service");

function currentUserId(req) {
  return req.user?._id || req.user?.id;
}

function makeOrderNumber() {
  const year = new Date().getFullYear();
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ACT-${year}-${suffix}`;
}

exports.validateOrder = async (req, res) => {
  try {
    const { cartId } = req.body;
    if (typeof cartId !== "string" || cartId.length < 8 || cartId.length > 100) {
      return res.status(400).json({ message: "Cart information is missing." });
    }
    const cart = await Cart.findOne({ cartId });
    if (!cart || !cart.items.length) return res.status(400).json({ message: "Your cart is empty." });
    const result = await getOrderRequirements(currentUserId(req), cart.items);
    return res.json(result);
  } catch (error) {
    console.error("Order validation failed:", error);
    return res.status(500).json({ message: "Could not validate your order requirements." });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const userId = currentUserId(req);
    const { cartId, customer = {}, paymentMethod = "simulated" } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "A valid demo customer identity is required." });
    }
    if (typeof cartId !== "string" || cartId.length < 8 || cartId.length > 100) {
      return res.status(400).json({ message: "Cart information is missing. Refresh your cart and try again." });
    }

    const fullName = String(customer.fullName || "").trim();
    const email = String(customer.email || "").trim().toLowerCase();
    const phone = String(customer.phone || "").trim();
    const businessName = String(customer.businessName || "").trim();
    const serviceAddress = String(customer.serviceAddress || "").trim();

    if (!fullName || fullName.length > 100) return res.status(400).json({ message: "Enter the contact person's name." });
    if (!/^[+0-9 ()-]{7,20}$/.test(phone)) return res.status(400).json({ message: "Enter a valid contact number." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (!businessName || businessName.length > 160) return res.status(400).json({ message: "Enter your business name." });
    if (!serviceAddress || serviceAddress.length > 600) return res.status(400).json({ message: "Enter the service installation address." });

    const cart = await Cart.findOne({ cartId });
    if (!cart || !cart.items.length) return res.status(400).json({ message: "Your cart is empty. Add products before placing an order." });

    const requirements = await getOrderRequirements(userId, cart.items);
    if (!requirements.eligible) {
      return res.status(409).json({ message: "Some requirements must be completed before ordering.", blockers: requirements.blockers });
    }

    const items = cart.items.map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      category: item.category || "",
      description: item.description || "",
      unit: item.unit || "",
      quantity: item.quantity,
      monthlyPrice: Number(item.price_min_inr_per_month) || 0,
    }));
    const totalMonthly = items.reduce((sum, item) => sum + item.monthlyPrice * item.quantity, 0);

    let orderNumber;
    let order;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      orderNumber = makeOrderNumber();
      try {
        order = await Order.create({
          userId,
          orderNumber,
          customer: { fullName, email, phone, businessName, serviceAddress },
          items,
          totalMonthly,
          status: "order_placed",
          paymentStatus: "simulated",
          paymentMethod: String(paymentMethod).slice(0, 40),
          trackingHistory: [{
            status: "order_placed",
            message: "Your order has been placed successfully. We will keep you updated here.",
            updatedBy: { role: "system", email: "" },
            updatedAt: new Date(),
          }],
        });
        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 2) throw error;
      }
    }

    // The order is safely stored before cart cleanup. A cleanup failure must not
    // make the client retry and accidentally create a duplicate order.
    try {
      cart.items = [];
      await cart.save();
    } catch (cleanupError) {
      console.error("Order created, but cart cleanup failed:", cleanupError);
    }
    return res.status(201).json({ message: "Order placed successfully.", order });
  } catch (error) {
    console.error("Create order failed:", error);
    return res.status(500).json({ message: "Could not place your order. Please try again." });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: currentUserId(req) }).sort({ createdAt: -1 }).lean();
    const safeOrders = orders.map((order) => ({
      ...order,
      trackingHistory: (order.trackingHistory || []).map(({ status, message, updatedAt }) => ({ status, message, updatedAt })),
    }));
    res.json({ orders: safeOrders });
  } catch (_) {
    res.status(500).json({ message: "Could not load your orders." });
  }
};
