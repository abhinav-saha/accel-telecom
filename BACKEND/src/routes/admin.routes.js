const express = require("express");
const controller = require("../controllers/admin.controller");
const { requireAdmin } = require("../middleware/adminAuth.middleware");

const router = express.Router();
router.post("/auth/login", controller.login);
router.use(requireAdmin);
router.get("/orders", controller.getOrders);
router.patch("/orders/:orderNumber", controller.updateOrder);
router.patch("/kyc/:documentId/review", require("../controllers/profile.controller").reviewKycDocument);

module.exports = router;
