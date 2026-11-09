
const express = require("express");

const router = express.Router();

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

// Start a new advisor session
router.post("/start", async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/chat/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Advisor start error:", error.message);
    return res.status(503).json({
      success: false,
      message: "AI advisor service is unavailable",
    });
  }
});

// Send an answer to the advisor
router.post("/message", async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Advisor message error:", error.message);
    return res.status(503).json({
      success: false,
      message: "AI advisor service is unavailable",
    });
  }
});

// Get product catalogue
router.get("/catalogue", async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/catalogue`);
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Advisor catalogue error:", error.message);
    return res.status(503).json({
      success: false,
      message: "AI advisor service is unavailable",
    });
  }
});

module.exports = router;
