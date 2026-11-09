const mongoose = require("mongoose");

const gstinRegistrySchema = new mongoose.Schema(
  {
    gstin: { type: String, required: true, unique: true, uppercase: true, trim: true },
    legalName: { type: String, required: true, trim: true },
    tradeName: { type: String, trim: true, default: "" },
    constitution: { type: String, trim: true, default: "" },
    principalPlaceOfBusiness: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    registrationDate: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["Active", "Suspended", "Cancelled"], required: true },
  },
  { timestamps: true, versionKey: false }
);



module.exports = mongoose.model("GSTINRegistry", gstinRegistrySchema, "gstinregistries");
