const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/remove-bg", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.json({ success: false, message: "No image provided" });
    }

    // TODO: Call remove.bg / Clipdrop / any BG-removal API here.
    // For now, just return the same image.
    return res.json({ success: true, image });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: "Server error" });
  }
});

app.post("/api/colorize", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.json({ success: false, message: "No image provided" });
    }

    // TODO: Call a B&W → Color AI API here.
    // For now, just return the same image.
    return res.json({ success: true, image });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
