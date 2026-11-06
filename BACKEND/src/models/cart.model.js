
const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
    {
        product_id: {
            type: String,
            required: true
        },
        product_name: {
            type: String,
            required: true
        },
        category: String,
        description: String,
        unit: String,
        price_min_inr_per_month: {
            type: Number,
            required: true,
            min: 0
        },
        price_max_inr_per_month: {
            type: Number,
            required: true,
            min: 0
        },
        quantity: {
            type: Number,
            default: 1,
            min: 1
        }
    },
    { _id: false }
);

const cartSchema = new mongoose.Schema(
    {
        cartId: {
            type: String,
            required: true,
            unique: true
        },
        items: [cartItemSchema]
    },
    { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
