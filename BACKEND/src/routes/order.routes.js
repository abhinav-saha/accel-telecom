const express = require("express");
const { authUser } = require("../middleware/auth.middleware");
const controller = require("../controllers/order.controller");

const router = express.Router();
// Customer identity is still the current demo identity; real customer auth is intentionally deferred.
router.use(authUser);
router.post("/validate", controller.validateOrder);
router.post("/", controller.createOrder);
router.get("/mine", controller.getMyOrders);

module.exports = router;
