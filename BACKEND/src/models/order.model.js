const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  category: String,
  description: String,
  unit: String,
  quantity: { type: Number, default: 1, min: 1 },
  monthlyPrice: { type: Number, default: 0, min: 0 },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: "" },
  phone: { type: String, required: true, trim: true },
  businessName: { type: String, required: true, trim: true },
  serviceAddress: { type: String, required: true, trim: true },
}, { _id: false });

const trackingEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  message: { type: String, default: "" },
  internalNote: { type: String, default: "" },
  updatedBy: {
    role: { type: String, enum: ["system", "admin"], default: "system" },
    email: { type: String, default: "" },
  },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const ORDER_STATUSES = [
  "order_placed",
  "payment_confirmed",
  "kyc_verification",
  "service_provisioning",
  "installation_scheduled",
  "installation_activation",
  "completed",
  "on_hold",
  "action_required",
  "cancelled",
  "failed",
];

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  orderNumber: { type: String, required: true, unique: true, index: true },
  customer: { type: customerSchema, required: true },
  items: { type: [orderItemSchema], default: [] },
  totalMonthly: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, enum: ["simulated", "pending"], default: "simulated" },
  paymentMethod: { type: String, default: "simulated", maxlength: 40 },
  status: { type: String, enum: ORDER_STATUSES, default: "order_placed", index: true },
  trackingHistory: { type: [trackingEventSchema], default: [] },
  expectedCompletionAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

orderSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
