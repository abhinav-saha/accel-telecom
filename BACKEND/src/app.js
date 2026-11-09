
const express = require("express");
const cors = require("cors");

const cartRoutes = require("./routes/cart.routes");
const profileRoutes = require("./routes/profile.routes");
const advisorRoutes = require("./routes/advisor.routes");
const orderRoutes = require("./routes/order.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();

// Middlewares
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use("/api/cart", cartRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/advisor", advisorRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Accel Telecom API is running",
  });
});

module.exports = app;
