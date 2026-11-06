
const express = require("express");

const {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart
} = require("../controllers/cart.controller");

const router = express.Router();

router.get("/:cartId", getCart);
router.post("/:cartId/items", addToCart);
router.patch("/:cartId/items/:productId", updateQuantity);
router.delete("/:cartId/items/:productId", removeFromCart);
router.delete("/:cartId", clearCart);

module.exports = router;
