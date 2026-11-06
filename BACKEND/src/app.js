
const express = require("express");
const cors = require("cors");

const cartRouter = require("./routes/cart.routes");

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
}));

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Accel Business API is running");
});

app.use("/api/cart", cartRouter);

module.exports = app;
