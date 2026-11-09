require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const GSTINRegistry = require("../models/gstinRegistry.model");
const UdyamRegistry = require("../models/udyamRegistry.model");
const { verifyGstin, verifyUdyam } = require("../services/registryVerification.service");

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const gstRecord = await GSTINRegistry.findOne({ status: "Active" }).lean();
    const udyamRecord = await UdyamRegistry.findOne({}).lean();

    if (!gstRecord || !udyamRecord) {
      throw new Error("Registry collections are empty. Import both CSV files first.");
    }

    const gstResult = await verifyGstin({
      gstin: gstRecord.gstin,
      businessName: gstRecord.legalName,
      state: gstRecord.state,
      confidence: 99,
    });

    const udyamResult = await verifyUdyam({
      udyamNumber: udyamRecord.udyamNumber,
      businessName: udyamRecord.enterpriseName,
      state: udyamRecord.state,
      confidence: 99,
    });

    console.log("GSTIN registry smoke test:", {
      matched: gstResult.registryCheck.outcome === "verified",
      identifier: gstResult.maskedIdentifier,
      result: gstResult.status,
      registryStatus: gstResult.registryCheck.registrationStatus,
    });
   console.log("Udyam registry smoke test:", {
  matched: udyamResult.registryCheck.outcome === "verified",
  identifier: udyamResult.maskedIdentifier,
  result: udyamResult.status,
  outcome: udyamResult.registryCheck.outcome,
  nameMatch: udyamResult.registryCheck.nameMatch,
  stateMatch: udyamResult.registryCheck.stateMatch,
  note: udyamResult.registryCheck.note,
});
  } catch (_) {
    console.error("Registry smoke test failed. Check MongoDB connectivity, registry imports and KYC_LOOKUP_HMAC_KEY.");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
