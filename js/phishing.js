let currentTool = "brush";
let brushSize = 10;

const canvas = document.getElementById("drawCanvas");
const img = document.getElementById("phishingImage");
const stage = document.getElementById("imageStage");
const ctx = canvas.getContext("2d");

let drawing = false;
let highlightedZones = []; // {x,y,size}
const requiredZones = 5;
const passThreshold = 3;

// --- Active tool button visuals -------------------------------------------
function setActiveButton(tool) {
    document.querySelectorAll(".tool-btn").forEach(btn => {
        const isActive = btn.dataset.tool === tool;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
}
function setTool(tool) {
    currentTool = tool;
    setActiveButton(tool);
}

// --- Brush size slider -----------------------------------------------------
const brushSlider = document.getElementById("brushSize");
if (brushSlider) {
    brushSlider.addEventListener("input", (e) => {
        brushSize = parseInt(e.target.value, 10);
    });
}

// --- Fit image & canvas to viewport ---------------------------------------
// Compute displayed size so the image fits inside the stage (which is sized via CSS)
function fitToStage() {
    if (!img.naturalWidth || !img.naturalHeight) return;

    const maxW = stage.clientWidth;
    const maxH = stage.clientHeight; // capped by CSS to a % of viewport
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);

    const dispW = Math.floor(img.naturalWidth * scale);
    const dispH = Math.floor(img.naturalHeight * scale);

    // Set displayed size
    img.style.width = dispW + "px";
    img.style.height = dispH + "px";

    // Match canvas internal pixels to displayed size
    canvas.width = dispW;
    canvas.height = dispH;
    canvas.style.width = dispW + "px";
    canvas.style.height = dispH + "px";

    // Clear & redraw highlights at new size (we store display-space coords)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    redrawHighlights();
}

window.addEventListener("resize", fitToStage);
img.onload = fitToStage;
if (img.complete) fitToStage();

// --- Drawing (continuous strokes) -----------------------------------------
let lastX = 0, lastY = 0;

canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    drawing = true;
});

canvas.addEventListener("mouseup", () => (drawing = false));
canvas.addEventListener("mouseout", () => (drawing = false));

canvas.addEventListener("mousemove", (e) => {
    if (!drawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === "brush") {
        ctx.strokeStyle = "rgba(255,0,0,0.5)";
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        highlightedZones.push({ x, y, size: brushSize });
    } else if (currentTool === "eraser") {
        ctx.clearRect(x - brushSize / 2, y - brushSize / 2, brushSize, brushSize);
        highlightedZones = highlightedZones.filter(
            (z) => Math.hypot(z.x - x, z.y - y) > brushSize
        );
    }

    lastX = x;
    lastY = y;
});

// --- Utilities -------------------------------------------------------------
function eraseAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    highlightedZones = [];
    updateCount(0);
}

function selectAll() {
    highlightedZones = [];
    const gap = canvas.width / (requiredZones + 1);
    for (let i = 1; i <= requiredZones; i++) {
        const x = gap * i;
        const y = canvas.height * 0.55;
        ctx.fillStyle = "rgba(255,0,0,0.5)";
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        highlightedZones.push({ x, y, size: 12 });
    }
    updateCount(requiredZones);
}

function redrawHighlights() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    highlightedZones.forEach((z) => {
        ctx.fillStyle = "rgba(255,0,0,0.5)";
        ctx.beginPath();
        ctx.arc(z.x, z.y, (z.size || 10) / 2, 0, Math.PI * 2);
        ctx.fill();
    });
}

// --- Save / Load (per image file) -----------------------------------------
// Save = store your drawn highlights (red marks) in the browser for *this* image.
// Load = bring them back (useful if you refresh or return later).
function imageKey() {
    // key based on filename so each example has its own saved highlights
    const src = img.getAttribute("src") || "phishing";
    const file = src.split("/").pop();
    return `phishing_highlights_${file}`;
}
function saveHighlights() {
    localStorage.setItem(imageKey(), JSON.stringify(highlightedZones));
    alert("Highlights saved for this example.");
}
function loadHighlights() {
    const data = localStorage.getItem(imageKey());
    if (data) {
        highlightedZones = JSON.parse(data);
        redrawHighlights();
        updateCount(highlightedZones.length);
    } else {
        alert("No saved highlights found for this example.");
    }
}

// --- Scoring ---------------------------------------------------------------
function submitHighlights() {
    const found = highlightedZones.length;
    updateCount(found);

    const feedback = document.getElementById("phishingFeedback");
    if (!feedback) return;

    if (found >= passThreshold) {
        feedback.textContent = "✅ Great job! You found enough phishing indicators.";
        feedback.style.color = "#09ff88";

        // mark puzzle complete
        try {
            const user = JSON.parse(localStorage.getItem("user"));
            if (user && user.username) {
                const key = `${user.username}_progress`;
                const prog = JSON.parse(localStorage.getItem(key)) || {};
                prog.phishing = true;
                localStorage.setItem(key, JSON.stringify(prog));
            }
        } catch { }
    } else {
        feedback.textContent = "❌ Not enough indicators. Try again.";
        feedback.style.color = "#ff5555";
    }
}

function updateCount(n) {
    const countDisplay = document.getElementById("vulnerabilityCount");
    if (countDisplay) {
        countDisplay.textContent = `You marked ${n} out of ${requiredZones} vulnerabilities.`;
    }
}

// Default active button on load
setActiveButton(currentTool);
