const mongoose = require("mongoose");

const udyamRegistrySchema = new mongoose.Schema(
  {
    udyamNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    enterpriseName: { type: String, required: true, trim: true },
    enterpriseType: { type: String, trim: true, default: "" },
    majorActivity: { type: String, trim: true, default: "" },
    nicDescription: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    dateOfRegistration: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false }
);



module.exports = mongoose.model("UdyamRegistry", udyamRegistrySchema, "udyamregistries");
