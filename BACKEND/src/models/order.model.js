const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  productId: String,
  productName: String,
  quantity: { type: Number, default: 1, min: 1 },
  monthlyPrice: { type: Number, default: 0, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  orderNumber: { type: String, required: true, unique: true },
  items: { type: [orderItemSchema], default: [] },
  totalMonthly: { type: Number, default: 0 },
  status: { type: String, enum: ["Pending", "Processing", "KYC Review", "Active", "Completed", "Cancelled", "Failed"], default: "Pending" },
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
