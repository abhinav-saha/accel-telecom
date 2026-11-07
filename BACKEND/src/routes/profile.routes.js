const express = require("express");
let authMiddleware;
try { authMiddleware = require("../middlewares/auth.middleware"); }
catch (_) { authMiddleware = require("../middleware/auth.middleware"); }
const uploadKyc = require("../middleware/kycUpload.middleware");
const controller = require("../controllers/profile.controller");

const router = express.Router();
router.use(authMiddleware.authUser);

router.get("/business", controller.getBusinessProfile);
router.put("/business", controller.updateBusinessProfile);

router.get("/bundles", controller.getSavedBundles);
router.post("/bundles", controller.saveBundle);
router.delete("/bundles/:bundleId", controller.deleteSavedBundle);

router.get("/active-products", controller.getActiveProducts);
router.get("/orders", controller.getOrders);

router.get("/kyc", controller.getKycDocuments);
router.post("/kyc/consent", controller.saveKycConsent);
router.delete("/kyc/consent", controller.withdrawKycConsent);
router.post("/kyc/:type", (req, res, next) => {
  uploadKyc.single("document")(req, res, (error) => {
    if (error) return res.status(400).json({ message: error.message });
    next();
  });
}, controller.uploadKycDocument);
router.get("/kyc/:documentId/file", controller.getKycFile);
router.patch("/kyc/:documentId/review", controller.reviewKycDocument);

module.exports = router;
