require("dotenv").config();
const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const GSTINRegistry = require("../models/gstinRegistry.model");
const UdyamRegistry = require("../models/udyamRegistry.model");

const dataPath = path.join(__dirname, "../../data");

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const input = fs.createReadStream(filePath);

    input
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);

    input.on("error", reject);
  });
}

const clean = (value) => (value || "").trim();

async function importRecords(Model, rows, key, transform) {
  const operations = rows.map((row) => {
    const document = transform(row);

    if (!document[key]) {
      throw new Error(`Missing required field: ${key}`);
    }

    return {
      updateOne: {
        filter: { [key]: document[key] },
        update: { $set: document },
        upsert: true,
      },
    };
  });

  for (let i = 0; i < operations.length; i += 500) {
    await Model.bulkWrite(operations.slice(i, i + 500));
  }

  return Model.countDocuments();
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    await GSTINRegistry.init();
    await UdyamRegistry.init();

    const gstinRows = await readCSV(
      path.join(dataPath, "mock_gstin_registry.csv")
    );

    const udyamRows = await readCSV(
      path.join(dataPath, "mock_udyam_registry.csv")
    );

    const gstinCount = await importRecords(
      GSTINRegistry,
      gstinRows,
      "gstin",
      (row) => {
        const status = clean(row.status);

        if (!["Active", "Suspended", "Cancelled"].includes(status)) {
          throw new Error("Unexpected GSTIN registration status");
        }

        return {
          gstin: clean(row.gstin).toUpperCase(),
          legalName: clean(row.legal_name),
          tradeName: clean(row.trade_name),
          constitution: clean(row.constitution),
          principalPlaceOfBusiness: clean(
            row.principal_place_of_business
          ),
          state: clean(row.state),
          registrationDate: clean(row.registration_date),
          status,
        };
      }
    );

    const udyamCount = await importRecords(
      UdyamRegistry,
      udyamRows,
      "udyamNumber",
      (row) => ({
        udyamNumber: clean(row.udyam_number).toUpperCase(),
        enterpriseName: clean(row.enterprise_name),
        enterpriseType: clean(row.enterprise_type),
        majorActivity: clean(row.major_activity),
        nicDescription: clean(row.nic_description),
        state: clean(row.state),
        city: clean(row.city),
        dateOfRegistration: clean(row.date_of_registration),
      })
    );

    console.log("Registry import completed");
    console.log("GSTIN records:", gstinCount);
    console.log("Udyam records:", udyamCount);
  } catch (error) {
    console.error("Registry import failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();