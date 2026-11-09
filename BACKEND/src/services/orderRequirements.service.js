const KycDocument = require("../models/kycDocument.model");
const products = require("../data/productRequirements.json");

const productById = new Map(products.map((product) => [product.productId, product]));

async function getOrderRequirements(userId, cartItems) {
  const currentDocs = await KycDocument.find({
    userId,
    isCurrent: true,
    type: { $in: ["udyamCertificate", "gstCertificate"] },
  }).select("type status").lean();

  const verifiedTypes = new Set(
    currentDocs.filter((doc) => doc.status === "accepted").map((doc) => doc.type)
  );
  const cartIds = new Set(cartItems.map((item) => item.product_id));
  const blockers = [];

  if (!verifiedTypes.has("udyamCertificate")) {
    blockers.push({
      code: "UDYAM_NOT_VERIFIED",
      title: "Udyam Registration is not verified",
      message: "Upload your Udyam certificate and wait for it to be approved before placing this order.",
      document: "Udyam Registration Certificate",
    });
  }

  for (const item of cartItems) {
    const product = productById.get(item.product_id);
    if (!product) continue;

    if (product.requiresGstin && !verifiedTypes.has("gstCertificate")) {
      blockers.push({
        code: "GSTIN_NOT_VERIFIED",
        productId: product.productId,
        productName: product.productName,
        title: `GSTIN verification required for ${product.productName}`,
        message: `${product.productName} requires a verified GST certificate. Upload your GST certificate and wait for approval.`,
        document: "GST Certificate",
      });
    }

    if (product.requiresOneOf.length && !product.requiresOneOf.some((id) => cartIds.has(id))) {
      const alternatives = product.requiresOneOf
        .map((id) => productById.get(id))
        .filter(Boolean)
        .map((entry) => ({ productId: entry.productId, productName: entry.productName }));
      blockers.push({
        code: "DEPENDENCY_MISSING",
        productId: product.productId,
        productName: product.productName,
        title: `${product.productName} needs a connectivity product`,
        message: `Add at least one of the required products below to use ${product.productName}.`,
        alternatives,
      });
    }
  }

  return { eligible: blockers.length === 0, blockers };
}

module.exports = { getOrderRequirements };
