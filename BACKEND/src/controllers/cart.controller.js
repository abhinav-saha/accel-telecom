
const Cart = require("../models/cart.model");

// GET cart
const getCart = async (req, res) => {
    try {
        const { cartId } = req.params;

        let cart = await Cart.findOne({ cartId });

        if (!cart) {
            cart = await Cart.create({ cartId, items: [] });
        }

        res.status(200).json(cart);
    } catch (error) {
        res.status(500).json({ message: "Unable to fetch cart" });
    }
};

// POST add product

// POST add product
const addToCart = async (req, res) => {
    try {
        const { cartId } = req.params;
        const product = req.body;

        const {
            product_id,
            product_name,
            price_min_inr_per_month,
            price_max_inr_per_month
        } = product;

        const quantity = product.quantity ?? 1;

        if (
            !product_id ||
            !product_name ||
            !Number.isFinite(price_min_inr_per_month) ||
            !Number.isFinite(price_max_inr_per_month) ||
            price_min_inr_per_month < 0 ||
            price_max_inr_per_month < price_min_inr_per_month ||
            !Number.isInteger(quantity) ||
            quantity < 1
        ) {
            return res.status(400).json({
                message: "Invalid product details"
            });
        }

        let cart = await Cart.findOne({ cartId });

        if (!cart) {
            cart = new Cart({ cartId, items: [] });
        }

        const existingItem = cart.items.find(
            item => item.product_id === product_id
        );

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.items.push({
                product_id,
                product_name,
                category: product.category,
                description: product.description,
                unit: product.unit,
                price_min_inr_per_month,
                price_max_inr_per_month,
                quantity
            });
        }

        await cart.save();

        res.status(200).json({
            message: "Product added to cart",
            cart
        });
    } catch (error) {
        console.error("Add to cart error:", error);
        res.status(500).json({
            message: "Unable to add product"
        });
    }
};

// PATCH update quantity
const updateQuantity = async (req, res) => {
    try {
        const { cartId, productId } = req.params;
        const { quantity } = req.body;

        if (!Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({
                message: "Quantity must be at least 1"
            });
        }

        const cart = await Cart.findOne({ cartId });

        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        const item = cart.items.find(
            item => item.product_id === productId
        );

        if (!item) {
            return res.status(404).json({ message: "Product not found" });
        }

        item.quantity = quantity;

        await cart.save();

        res.status(200).json({
            message: "Quantity updated",
            cart
        });
    } catch (error) {
        res.status(500).json({ message: "Unable to update quantity" });
    }
};

// DELETE remove product
const removeFromCart = async (req, res) => {
    try {
        const { cartId, productId } = req.params;

        const cart = await Cart.findOne({ cartId });

        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        cart.items = cart.items.filter(
            item => item.product_id !== productId
        );

        await cart.save();

        res.status(200).json({
            message: "Product removed",
            cart
        });
    } catch (error) {
        res.status(500).json({ message: "Unable to remove product" });
    }
};

// DELETE clear cart
const clearCart = async (req, res) => {
    try {
        const { cartId } = req.params;

        const cart = await Cart.findOne({ cartId });

        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        cart.items = [];

        await cart.save();

        res.status(200).json({
            message: "Cart cleared",
            cart
        });
    } catch (error) {
        res.status(500).json({ message: "Unable to clear cart" });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart
};
