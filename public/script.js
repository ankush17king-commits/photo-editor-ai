let canvas = new fabric.Canvas("editorCanvas", {
  backgroundColor: "#0b0c1a",
  selection: true,
  preserveObjectStacking: true
});

let currentImage = null;
let history = [];
let isUndoing = false;
let currentMode = "move";
let cropRect = null;
let isCropMode = false;

const loader = document.getElementById("loader");

function showLoader(show) {
  loader.classList.toggle("hidden", !show);
}

/* ---------- Resize Canvas to Full Wrapper ---------- */

function resizeCanvas() {
  const wrapper = document.querySelector(".canvas-wrapper");
  const rect = wrapper.getBoundingClientRect();
  canvas.setWidth(rect.width);
  canvas.setHeight(rect.height);
  canvas.renderAll();
  if (currentImage) {
    currentImage.setCoords();
  }
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", resizeCanvas);

/* ---------- History (Undo) ---------- */

function saveState() {
  if (isUndoing) return;
  const json = canvas.toJSON();
  history.push(json);
  if (history.length > 40) history.shift();
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

/* ---------- Upload ---------- */

document.getElementById("uploadImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

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
    });
  };
  reader.readAsDataURL(file);
});

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
    originY: "center"
  });
}

/* ---------- Modes (Move / Brush / Eraser / Crop) ---------- */

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
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  canvas.freeDrawingBrush.color = brushColorInput.value;
  let size = parseInt(brushSizeInput.value, 10) || 10;
  let type = brushTypeSelect.value;

  if (type === "marker") {
    size *= 2;
  } else if (type === "highlighter") {
    size *= 2;
    canvas.freeDrawingBrush.color = hexToRgba(brushColorInput.value, 0.4);
  }
  canvas.freeDrawingBrush.width = size;
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

/* ---------- Eraser ---------- */

function enableEraser() {
  canvas.isDrawingMode = false;
  canvas.on("mouse:down", handleEraser);
}

function handleEraser(opt) {
  if (currentMode !== "eraser") return;
  const evt = opt.e;
  const pointer = canvas.getPointer(evt);
  const eraseCircle = new fabric.Circle({
    left: pointer.x,
    top: pointer.y,
    radius: parseInt(brushSizeInput.value, 10) || 10,
    originX: "center",
    originY: "center"
  });

  canvas.remove(eraseCircle);

  const objects = canvas.getObjects();
  objects.forEach((obj) => {
    if (obj === eraseCircle) return;
    if (obj.containsPoint(pointer) && obj !== currentImage) {
      canvas.remove(obj);
    }
  });
}

/* ---------- Text ---------- */

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
    editable: true
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

/* ---------- Filters ---------- */

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

document.getElementById("rotateLeft").addEventListener("click", () => {
  if (!currentImage) return;
  currentImage.rotate((currentImage.angle || 0) - 90);
  rotateRange.value = currentImage.angle;
  canvas.renderAll();
  saveState();
});

document.getElementById("rotateRight").addEventListener("click", () => {
  if (!currentImage) return;
  currentImage.rotate((currentImage.angle || 0) + 90);
  rotateRange.value = currentImage.angle;
  canvas.renderAll();
  saveState();
});

/* ---------- Resize Image (width/height) ---------- */

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
    scaleY: scaleY
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
    fill: "rgba(255,255,255,0.1)",
    selectable: false,
    evented: false
  });
  canvas.add(cropRect);
}

function resizeCropRect(opt) {
  if (!isCropMode || !cropRect) return;
  const pointer = canvas.getPointer(opt.e);

  cropRect.set({
    width: pointer.x - cropRect.left,
    height: pointer.y - cropRect.top
  });
  cropRect.setCoords();
  canvas.renderAll();
}

function finishCropRect() {}

function applyCrop() {
  if (!isCropMode || !cropRect || !currentImage) return;
  const rect = cropRect.getBoundingRect();

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = rect.width;
  tempCanvas.height = rect.height;
  const ctx = tempCanvas.getContext("2d");

  const imgEl = currentImage._originalElement || currentImage._element;
  const zoom = canvas.getZoom ? canvas.getZoom() : 1;

  const sx = (rect.left - currentImage.left + currentImage.getScaledWidth() / 2) / currentImage.scaleX;
  const sy = (rect.top - currentImage.top + currentImage.getScaledHeight() / 2) / currentImage.scaleY;

  ctx.drawImage(
    imgEl,
    sx, sy, rect.width / currentImage.scaleX, rect.height / currentImage.scaleY,
    0, 0, rect.width, rect.height
  );

  const dataUrl = tempCanvas.toDataURL("image/png");

  fabric.Image.fromURL(dataUrl, (img) => {
    canvas.remove(currentImage);
    canvas.remove(cropRect);
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
    quality: 1
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
  if (!currentImage) return;
  showLoader(true);
  const dataURL = canvas.toDataURL({ format: "png", quality: 1 });

  try {
    const res = await fetch("/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataURL })
    });

    const data = await res.json();
    if (data.success && data.image) {
      fabric.Image.fromURL(data.image, (img) => {
        canvas.clear();
        currentImage = img;
        fitImageToCanvas(img);
        canvas.add(img);
        canvas.renderAll();
        saveState();
      });
    } else {
      alert("Remove background failed (backend not configured)");
    }
  } catch (err) {
    console.error(err);
    alert("Error calling background removal API");
  } finally {
    showLoader(false);
  }
});

/* ---------- AI: B&W → Color ---------- */

document.getElementById("colorizeBtn").addEventListener("click", async () => {
  if (!currentImage) return;
  showLoader(true);
  const dataURL = canvas.toDataURL({ format: "png", quality: 1 });

  try {
    const res = await fetch("/api/colorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataURL })
    });

    const data = await res.json();
    if (data.success && data.image) {
      fabric.Image.fromURL(data.image, (img) => {
        canvas.clear();
        currentImage = img;
        fitImageToCanvas(img);
        canvas.add(img);
        canvas.renderAll();
        saveState();
      });
    } else {
      alert("Colorization failed (backend not configured)");
    }
  } catch (err) {
    console.error(err);
    alert("Error calling colorization API");
  } finally {
    showLoader(false);
  }
});

/* ---------- Initial Mode ---------- */
updateMode();
