const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");

// node-fetch ko CommonJS me use karne ka tareeka
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ----------------- Remove Background API -----------------
app.post("/api/remove-bg", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res
        .status(400)
        .json({ success: false, message: "No image provided" });
    }

    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      console.error("REMOVE_BG_API_KEY missing in env");
      return res.status(500).json({
        success: false,
        message: "Server not configured for remove.bg",
      });
    }

    // remove.bg ko base64 bhejna (form encoded)
    const formData = new URLSearchParams();
    formData.append("image_file_b64", image);
    formData.append("size", "auto");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("remove.bg error:", response.status, text);
      return res.status(500).json({
        success: false,
        message: "remove.bg request failed",
      });
    }

    const buffer = await response.buffer();

    return res.json({
      success: true,
      image: buffer.toString("base64"),
    });
  } catch (err) {
    console.error("Remove BG error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error in remove-bg" });
  }
});

// ----------------- Colorize placeholder API -----------------
app.post("/api/colorize", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res
        .status(400)
        .json({ success: false, message: "No image provided" });
    }

    // TODO: yahan baad me real colorization API connect karenge
    return res.json({ success: true, image });
  } catch (err) {
    console.error("Colorize error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error in colorize" });
  }
});

// ----------------- Start Server -----------------
app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
