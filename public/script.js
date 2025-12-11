/*******************************************
  script.js - Updated, cleaned & mobile-ready
********************************************/

/* ---------- Canvas init ---------- */
const canvas = new fabric.Canvas("editorCanvas", {
  backgroundColor: "#0b0c1a",
  selection: true,
  preserveObjectStacking: true,
});

let currentImage = null;
let history = [];
let isUndoing = false;
let currentMode = "move";
let cropRect = null;
let isCropMode = false;

/* loader element */
const loader = document.getElementById("loader");
function showLoader(show) {
  loader.classList.toggle("hidden", !show);
}

/* ---------- Responsive / Crisp Canvas ---------- */
function resizeCanvas() {
  const wrapper = document.querySelector(".canvas-wrapper");
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();

  // CSS pixel size (space in layout)
  const cssWidth = Math.max(320, Math.floor(rect.width));
  const cssHeight = Math.max(320, Math.floor(rect.height));

  // device pixel ratio for crisp rendering
  const ratio = window.devicePixelRatio || 1;

  // Set CSS sizes
  canvas.setWidth(cssWidth);
  canvas.setHeight(cssHeight);

  // Set backing store size for crispness (backstoreOnly avoids changing object coords)
  canvas.setDimensions(
    { width: Math.floor(cssWidth * ratio), height: Math.floor(cssHeight * ratio) },
    { backstoreOnly: true }
  );

  // If you want to scale content based on physical size, reconsider scaling objects here.
  canvas.setZoom(1);
  canvas.renderAll();

  if (currentImage) {
    currentImage.setCoords();
  }
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);
window.addEventListener("load", () => {
  resizeCanvas();
  setTimeout(resizeCanvas, 250);
});

/* ---------- History (Undo) ---------- */
function saveState() {
  if (isUndoing) return;
  try {
    const json = canvas.toJSON(["selectable"]);
    history.push(json);
    if (history.length > 40) history.shift();
  } catch (e) {
    console.warn("saveState error", e);
  }
}

document.getElementById("undoBtn").addEventListener("click", () => {
  if (!history.length) return;
  isUndoing = true;
  const last = history.pop();
  canvas.loadFromJSON(last, () => {
    canvas.renderAll();
    isUndoing = false;
  });
});

["object:added", "object:modified", "object:removed"].forEach((ev) => {
  canvas.on(ev, () => saveState());
});

/* ---------- Upload Image ---------- */
document.getElementById("uploadImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
document.getElementById("placeholderText").style.display = "none";

  const reader = new FileReader();
  reader.onload = function (f) {
    fabric.Image.fromURL(f.target.result, function (img) {
      if (currentImage) canvas.remove(currentImage);
      currentImage = img;
      fitImageToCanvas(img);
      canvas.add(img);
      canvas.setActiveObject(img);
      saveState();
      document.getElementById("imgWidth").value = Math.round(img.getScaledWidth());
      document.getElementById("imgHeight").value = Math.round(img.getScaledHeight());
      canvas.renderAll();
    });
  };
  reader.readAsDataURL(file);
});

/* ---------- Fit Image ---------- */
function fitImageToCanvas(img) {
  const canvasWidth = canvas.getWidth();
  const canvasHeight = canvas.getHeight();
  const imgRatio = img.width / img.height;
  const canvasRatio = canvasWidth / canvasHeight;
  let scale;

  if (imgRatio > canvasRatio) {
    scale = canvasWidth / img.width;
  } else {
    scale = canvasHeight / img.height;
  }

  img.scale(scale * 0.95);
  img.set({
    left: canvasWidth / 2,
    top: canvasHeight / 2,
    originX: "center",
    originY: "center",
    selectable: true,
  });
  img.setCoords();
}

/* ---------- Tool Modes (Move / Brush / Eraser / Crop) ---------- */
const toolButtons = document.querySelectorAll(".tool-btn");
toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    toolButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
    updateMode();
  });
});

function updateMode() {
  // Reset listeners that might conflict
  canvas.isDrawingMode = false;
  canvas.selection = true;
  canvas.off("mouse:down", handleEraser);
  canvas.off("mouse:down", startCropRect);
  canvas.off("mouse:move", resizeCropRect);
  canvas.off("mouse:up", finishCropRect);

  if (currentMode === "brush") {
    canvas.isDrawingMode = true;
    setupBrush();
    isCropMode = false;
  } else if (currentMode === "eraser") {
    canvas.isDrawingMode = false;
    isCropMode = false;
    enableEraser();
  } else if (currentMode === "crop") {
    canvas.isDrawingMode = false;
    enableCropMode();
  } else {
    // move/default
    canvas.isDrawingMode = false;
    isCropMode = false;
    if (cropRect) {
      canvas.remove(cropRect);
      cropRect = null;
    }
  }
}

/* ---------- Brush Settings ---------- */
const brushTypeSelect = document.getElementById("brushType");
const brushColorInput = document.getElementById("brushColor");
const brushSizeInput = document.getElementById("brushSize");

function setupBrush() {
  // Use PencilBrush for normal drawing
  const pencil = new fabric.PencilBrush(canvas);
  let size = parseInt(brushSizeInput.value, 10) || 10;
  const type = brushTypeSelect.value;

  if (type === "marker") size *= 2;
  if (type === "highlighter") {
    size *= 2;
    pencil.color = hexToRgba(brushColorInput.value, 0.4);
  } else {
    pencil.color = brushColorInput.value;
  }
  pencil.width = size;
  canvas.freeDrawingBrush = pencil;
}

function hexToRgba(hex, alpha) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

brushTypeSelect.addEventListener("change", () => {
  if (currentMode === "brush") setupBrush();
});
brushColorInput.addEventListener("input", () => {
  if (currentMode === "brush") setupBrush();
});
brushSizeInput.addEventListener("input", () => {
  if (currentMode === "brush") setupBrush();
});

/* ---------- Eraser (removes drawn paths / shapes under pointer) ---------- */
function enableEraser() {
  canvas.selection = false;
  canvas.on("mouse:down", handleEraser);
}

function handleEraser(opt) {
  if (currentMode !== "eraser") return;
  const evt = opt.e;
  const pointer = canvas.getPointer(evt);
  const radius = parseInt(brushSizeInput.value, 10) || 10;

  // Remove paths/objects that intersect pointer (exclude the background image)
  const objects = canvas.getObjects().slice().reverse(); // top-first
  for (const obj of objects) {
    if (!obj || obj === currentImage) continue;
    // For paths and simple shapes, use containsPoint
    try {
      if (obj.containsPoint && obj.containsPoint(pointer)) {
        canvas.remove(obj);
      } else {
        // fallback: bounding box check
        const bb = obj.getBoundingRect();
        if (
          pointer.x >= bb.left &&
          pointer.x <= bb.left + bb.width &&
          pointer.y >= bb.top &&
          pointer.y <= bb.top + bb.height
        ) {
          canvas.remove(obj);
        }
      }
    } catch (e) {
      // ignore objects that can't be tested
    }
  }
  canvas.renderAll();
  saveState();
}

/* ---------- Text Tools ---------- */
const textInput = document.getElementById("textInput");
const fontSizeInput = document.getElementById("fontSize");
const textColorInput = document.getElementById("textColor");
const fontFamilySelect = document.getElementById("fontFamily");

document.getElementById("addTextBtn").addEventListener("click", () => {
  const value = textInput.value.trim();
  if (!value) return;
  const text = new fabric.Textbox(value, {
    left: canvas.getWidth() / 2,
    top: canvas.getHeight() / 2,
    originX: "center",
    originY: "center",
    fontSize: parseInt(fontSizeInput.value, 10) || 32,
    fill: textColorInput.value,
    fontFamily: fontFamilySelect.value,
    editable: true,
  });

  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.renderAll();
  saveState();
});

canvas.on("selection:created", updateTextControls);
canvas.on("selection:updated", updateTextControls);

function updateTextControls() {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "textbox") {
    textInput.value = obj.text || "";
    fontSizeInput.value = obj.fontSize || 32;
    textColorInput.value = obj.fill || "#ffffff";
    fontFamilySelect.value = obj.fontFamily || "Poppins";
  }
}

fontSizeInput.addEventListener("input", () => {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "textbox") {
    obj.set("fontSize", parseInt(fontSizeInput.value, 10) || 32);
    canvas.renderAll();
    saveState();
  }
});
textColorInput.addEventListener("input", () => {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "textbox") {
    obj.set("fill", textColorInput.value);
    canvas.renderAll();
    saveState();
  }
});
fontFamilySelect.addEventListener("change", () => {
  const obj = canvas.getActiveObject();
  if (obj && obj.type === "textbox") {
    obj.set("fontFamily", fontFamilySelect.value);
    canvas.renderAll();
    saveState();
  }
});

/* ---------- Image Filters ---------- */
const filterButtons = document.querySelectorAll(".filter-btn");
const resetFiltersBtn = document.getElementById("resetFilters");

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!currentImage) return;
    const type = btn.dataset.filter;
    applyFilter(type);
  });
});

resetFiltersBtn.addEventListener("click", () => {
  if (!currentImage) return;
  currentImage.filters = [];
  currentImage.applyFilters();
  canvas.renderAll();
  saveState();
});

function applyFilter(type) {
  if (!currentImage) return;
  const filters = fabric.Image.filters;
  let f;
  switch (type) {
    case "grayscale":
      f = new filters.Grayscale();
      break;
    case "sepia":
      f = new filters.Sepia();
      break;
    case "invert":
      f = new filters.Invert();
      break;
    default:
      return;
  }
  currentImage.filters = [f];
  currentImage.applyFilters();
  canvas.renderAll();
  saveState();
}

/* ---------- Transform: Rotate + Scale ---------- */
const rotateRange = document.getElementById("rotateRange");
const scaleRange = document.getElementById("scaleRange");

rotateRange.addEventListener("input", () => {
  if (!currentImage) return;
  currentImage.set("angle", parseInt(rotateRange.value, 10) || 0);
  canvas.renderAll();
  saveState();
});

scaleRange.addEventListener("input", () => {
  if (!currentImage) return;
  const factor = (parseInt(scaleRange.value, 10) || 100) / 100;
  currentImage.scale(factor);
  canvas.renderAll();
  saveState();
});

/* optional rotate buttons if present in HTML */
const rotateLeftBtn = document.getElementById("rotateLeft");
const rotateRightBtn = document.getElementById("rotateRight");
if (rotateLeftBtn) {
  rotateLeftBtn.addEventListener("click", () => {
    if (!currentImage) return;
    currentImage.rotate((currentImage.angle || 0) - 90);
    rotateRange.value = currentImage.angle;
    canvas.renderAll();
    saveState();
  });
}
if (rotateRightBtn) {
  rotateRightBtn.addEventListener("click", () => {
    if (!currentImage) return;
    currentImage.rotate((currentImage.angle || 0) + 90);
    rotateRange.value = currentImage.angle;
    canvas.renderAll();
    saveState();
  });
}

/* ---------- Resize Image ---------- */
document.getElementById("applyResize").addEventListener("click", () => {
  if (!currentImage) return;
  const w = parseInt(document.getElementById("imgWidth").value, 10);
  const h = parseInt(document.getElementById("imgHeight").value, 10);
  if (!w || !h) return;

  const origW = currentImage.width;
  const origH = currentImage.height;
  const scaleX = w / origW;
  const scaleY = h / origH;
  currentImage.set({
    scaleX: scaleX,
    scaleY: scaleY,
  });
  canvas.renderAll();
  saveState();
});

/* ---------- Crop ---------- */
const startCropBtn = document.getElementById("startCrop");
const applyCropBtn = document.getElementById("applyCrop");
const cancelCropBtn = document.getElementById("cancelCrop");

startCropBtn.addEventListener("click", enableCropMode);
applyCropBtn.addEventListener("click", applyCrop);
cancelCropBtn.addEventListener("click", cancelCrop);

function enableCropMode() {
  if (!currentImage) return;
  isCropMode = true;
  canvas.discardActiveObject();
  canvas.renderAll();

  canvas.on("mouse:down", startCropRect);
  canvas.on("mouse:move", resizeCropRect);
  canvas.on("mouse:up", finishCropRect);
}

function startCropRect(opt) {
  if (!isCropMode) return;
  const pointer = canvas.getPointer(opt.e);
  cropRect = new fabric.Rect({
    left: pointer.x,
    top: pointer.y,
    originX: "left",
    originY: "top",
    width: 0,
    height: 0,
    stroke: "#ffffff",
    strokeWidth: 1,
    fill: "rgba(255,255,255,0.12)",
    selectable: false,
    evented: false,
  });
  canvas.add(cropRect);
}

function resizeCropRect(opt) {
  if (!isCropMode || !cropRect) return;
  const pointer = canvas.getPointer(opt.e);
  cropRect.set({
    width: Math.max(1, pointer.x - cropRect.left),
    height: Math.max(1, pointer.y - cropRect.top),
  });
  cropRect.setCoords();
  canvas.renderAll();
}

function finishCropRect() {
  // nothing here – applyCrop will use the cropRect
}

function applyCrop() {
  if (!isCropMode || !cropRect || !currentImage) return;
  const rect = cropRect.getBoundingRect(true);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = Math.round(rect.width);
  tempCanvas.height = Math.round(rect.height);
  const ctx = tempCanvas.getContext("2d");

  // source image element
  const imgEl = currentImage._originalElement || currentImage._element;
  if (!imgEl) {
    alert("Crop not possible: internal image not accessible.");
    return;
  }

  // Calculate cropping source coordinates on original image
  // Get scaled/positioned info
  const imgLeft = currentImage.left - currentImage.getScaledWidth() / 2;
  const imgTop = currentImage.top - currentImage.getScaledHeight() / 2;
  const sx = (rect.left - imgLeft) / currentImage.scaleX;
  const sy = (rect.top - imgTop) / currentImage.scaleY;
  const sWidth = rect.width / currentImage.scaleX;
  const sHeight = rect.height / currentImage.scaleY;

  ctx.drawImage(imgEl, sx, sy, sWidth, sHeight, 0, 0, rect.width, rect.height);

  const dataUrl = tempCanvas.toDataURL("image/png");

  fabric.Image.fromURL(dataUrl, (img) => {
    canvas.remove(currentImage);
    if (cropRect) canvas.remove(cropRect);
    cropRect = null;
    currentImage = img;
    fitImageToCanvas(img);
    canvas.add(img);
    canvas.setActiveObject(img);
    isCropMode = false;
    canvas.off("mouse:down", startCropRect);
    canvas.off("mouse:move", resizeCropRect);
    canvas.off("mouse:up", finishCropRect);
    canvas.renderAll();
    saveState();
  });
}

function cancelCrop() {
  isCropMode = false;
  if (cropRect) {
    canvas.remove(cropRect);
    cropRect = null;
  }
  canvas.off("mouse:down", startCropRect);
  canvas.off("mouse:move", resizeCropRect);
  canvas.off("mouse:up", finishCropRect);
}

/* ---------- Download ---------- */
document.getElementById("downloadBtn").addEventListener("click", () => {
  const dataURL = canvas.toDataURL({
    format: "png",
    quality: 1,
  });
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = "photonx-edit.png";
  link.click();
});

/* ---------- Clear ---------- */
document.getElementById("clearBtn").addEventListener("click", () => {
  canvas.clear();
  canvas.setBackgroundColor("#0b0c1a", canvas.renderAll.bind(canvas));
  currentImage = null;
  history = [];
});

/* ---------- AI: Remove Background ---------- */
document.getElementById("removeBgBtn").addEventListener("click", async () => {
  if (!currentImage) return alert("Please upload an image first.");
  showLoader(true);

  // If using entire canvas, convert to PNG data url and strip prefix
  const dataURL = canvas.toDataURL({ format: "png", quality: 1 });
  const base64 = dataURL.split(",")[1]; // send raw base64 only

  try {
    const res = await fetch("/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
    });

    const data = await res.json();
    if (data && data.success && data.image) {
      const imgDataURL = "data:image/png;base64," + data.image;
      fabric.Image.fromURL(imgDataURL, (img) => {
        canvas.clear();
        currentImage = img;
        fitImageToCanvas(img);
        canvas.add(img);
        canvas.renderAll();
        saveState();
      });
    } else {
      console.warn("remove-bg response:", data);
      alert("Remove background failed (backend returned error).");
    }
  } catch (err) {
    console.error(err);
    alert("Error calling background removal API.");
  } finally {
    showLoader(false);
  }
});

/* ---------- AI: Colorize (placeholder / same flow) ---------- */
document.getElementById("colorizeBtn").addEventListener("click", async () => {
  if (!currentImage) return alert("Please upload an image first.");
  showLoader(true);

  const dataURL = canvas.toDataURL({ format: "png", quality: 1 });
  const base64 = dataURL.split(",")[1];

  try {
    const res = await fetch("/api/colorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
    });

    const data = await res.json();
    if (data && data.success && data.image) {
      const imgDataURL = data.image.startsWith("data:")
        ? data.image
        : "data:image/png;base64," + data.image;
      fabric.Image.fromURL(imgDataURL, (img) => {
        canvas.clear();
        currentImage = img;
        fitImageToCanvas(img);
        canvas.add(img);
        canvas.renderAll();
        saveState();
      });
    } else {
      console.warn("colorize response:", data);
      alert("Colorization failed (backend returned error).");
    }
  } catch (err) {
    console.error(err);
    alert("Error calling colorization API.");
  } finally {
    showLoader(false);
  }
});

/* ---------- Init ---------- */
canvas.setBackgroundColor("#0b0c1a", canvas.renderAll.bind(canvas));
updateMode();
saveState();
