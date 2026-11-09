const Admin = require("../models/admin.model");
const Order = require("../models/order.model");
const { verifyPassword, signAdminToken } = require("../services/adminAuth.service");

const STATUS_MESSAGES = {
  order_placed: "Your order has been placed successfully.",
  payment_confirmed: "Your payment has been confirmed.",
  kyc_verification: "We are verifying your business documents.",
  service_provisioning: "We are configuring your selected services.",
  installation_scheduled: "Your installation visit has been scheduled.",
  installation_activation: "Installation is underway and your services are being activated.",
  completed: "Your order is complete. Your services are ready to use.",
  on_hold: "Your order is temporarily on hold. Our team will share an update.",
  action_required: "We need some additional information from you to continue.",
  cancelled: "This order has been cancelled.",
  failed: "We could not complete this order. Our team will contact you.",
};

exports.login = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ message: "Enter your admin email and password." });
    const admin = await Admin.findOne({ email });
    if (!admin || !verifyPassword(password, admin.passwordSalt, admin.passwordHash)) {
      return res.status(401).json({ message: "Invalid admin email or password." });
    }
    const token = signAdminToken(admin);
    admin.lastLoginAt = new Date();
    await admin.save();
    res.json({ token, admin: { id: admin._id, email: admin.email, role: admin.role } });
  } catch (error) {
    if (error.message?.includes("ADMIN_JWT_SECRET")) {
      return res.status(503).json({ message: "Admin authentication is not configured. Set ADMIN_JWT_SECRET in the backend .env file." });
    }
    res.status(500).json({ message: "Could not sign in to the admin dashboard." });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (search) {
      const safeSearch = String(search).trim().slice(0, 80);
      filter.$or = [
        { orderNumber: { $regex: safeSearch, $options: "i" } },
        { "customer.fullName": { $regex: safeSearch, $options: "i" } },
        { "customer.businessName": { $regex: safeSearch, $options: "i" } },
        { "customer.phone": { $regex: safeSearch, $options: "i" } },
      ];
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ orders });
  } catch (_) {
    res.status(500).json({ message: "Could not load admin orders." });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ message: "Order not found." });

    const { status, message = "", internalNote = "", expectedCompletionAt = null } = req.body;
    const allowed = require("../models/order.model").ORDER_STATUSES;
    if (!allowed.includes(status)) return res.status(400).json({ message: "Select a valid order status." });
    if (order.status === "completed" && status !== "completed") {
      return res.status(409).json({ message: "Completed orders cannot be reopened from this dashboard." });
    }

    const customerMessage = String(message || "").trim().slice(0, 500) || STATUS_MESSAGES[status];
    const privateNote = String(internalNote || "").trim().slice(0, 1000);
    let expectedDate = order.expectedCompletionAt;
    if (expectedCompletionAt) {
      const parsed = new Date(expectedCompletionAt);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ message: "Enter a valid expected completion date." });
      expectedDate = parsed;
    }

    order.status = status;
    order.expectedCompletionAt = expectedDate;
    if (status === "completed") order.completedAt = new Date();
    order.trackingHistory.push({
      status,
      message: customerMessage,
      internalNote: privateNote,
      updatedBy: { role: "admin", email: req.admin.email },
      updatedAt: new Date(),
    });
    await order.save();
    res.json({ message: "Order updated successfully.", order });
  } catch (error) {
    console.error("Update order failed:", error);
    res.status(500).json({ message: "Could not update this order." });
  }
};
