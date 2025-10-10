/* phishing.js — Phishing Spotter (Cyber Escape Rooms)
   Features
   - Loads 4 example images (or any provided via ?img=…)
   - Drawing tools: brush / eraser, adjustable size, mouse + touch
   - Hotspot scoring from #phishingHotspots (percentage coordinates)
   - Strict check: a hotspot counts when highlighted within a small radius
   - Save / Load / Clear / Auto-place (for demos)
   - Marks puzzle complete in ${user}_progress.phishing when threshold met
*/

(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const announce = (m) => { try { window.a11y?.announce?.(m); } catch(_){} };

  // ---------- Elements ----------
  const imgEl        = $('#phishingImage');
  const stageEl      = $('#imageStage');
  const drawCanvas   = $('#drawCanvas');
  const brushSizeEl  = $('#brushSize');
  const feedbackEl   = $('#phishingFeedback');
  const vulnCountEl  = $('#vulnerabilityCount');
  const submitBtn    = $('#submitButton');

  if (!imgEl || !drawCanvas) return; // not on this page

  const ctx = drawCanvas.getContext('2d', { willReadFrequently: true });

  // A hidden mask canvas we use for scoring (1-bit-ish)
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

  // ---------- Config ----------
  // How close (in pixels) the highlight must be to the hotspot center to count
  const HOTSPOT_RADIUS_PX = 28; // tuned for typical email screenshots
  // Required proportion of hotspots on an image to count as "complete" for this puzzle
  const REQUIRED_PCT = 0.75;

  const DEFAULT_IMAGE = 'Picture1.png';
  const IMAGES = ['Picture1.png','Picture2.png','Picture3.png','Picture4.png'];

  // Tool state
  const state = {
    tool: 'brush', // 'brush' | 'eraser'
    size: 12,
    drawing: false,
    lastX: 0,
    lastY: 0,
    scaleX: 1,
    scaleY: 1,
    hotspots: [],
    found: new Set(), // indexes of hotspots found
    imgName: DEFAULT_IMAGE
  };

  // ---------- Utility: Storage ----------
  function readUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }
  function progressKey(u) { return `${u?.username || 'team'}_progress`; }

  function markCompleteIfReady() {
    const required = Math.ceil(state.hotspots.length * REQUIRED_PCT);
    if (state.found.size >= required) {
      const u = readUser();
      const key = progressKey(u);
      let p;
      try { p = JSON.parse(localStorage.getItem(key) || '{}'); } catch { p = {}; }
      if (!p.phishing) {
        p.phishing = true;
        localStorage.setItem(key, JSON.stringify(p));
        setFeedback('✅ Great work! You spotted enough phishing indicators. Digit earned.', true);
        announce('Phishing puzzle complete');
      }
    }
    updateVulnText();
  }

  function storageKey() {
    const u = readUser();
    const user = u?.username || 'team';
    return `${user}_phishing_${state.imgName}`;
  }

  // Save mask as PNG data URL + found indexes
  function saveHighlights() {
    const data = {
      mask: maskCanvas.toDataURL('image/png'),
      found: Array.from(state.found)
    };
    localStorage.setItem(storageKey(), JSON.stringify(data));
    setFeedback('Saved your highlights.');
  }

  async function loadHighlights() {
    const raw = localStorage.getItem(storageKey());
    if (!raw) { setFeedback('No saved highlights for this image.'); return; }
    try {
      const data = JSON.parse(raw);
      await drawDataUrlToCanvas(data.mask, maskCanvas, maskCtx);
      // Mirror the mask to visible canvas lightly
      redrawFromMask();
      state.found = new Set(Array.isArray(data.found) ? data.found : []);
      setFeedback('Loaded saved highlights.');
      markCompleteIfReady();
    } catch {
      setFeedback('Could not load saved highlights.');
    }
  }

  function eraseAll() {
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    state.found.clear();
    setFeedback('Cleared.');
    updateVulnText();
  }

  function selectAll() {
    // Draw circles on all hotspots into both mask + visible canvas
    state.hotspots.forEach((hs, i) => {
      const { x, y } = pctToPx(hs);
      maskCtx.beginPath();
      maskCtx.fillStyle = '#000'; // mask drawn area
      maskCtx.arc(x, y, HOTSPOT_RADIUS_PX * 0.8, 0, Math.PI * 2);
      maskCtx.fill();

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,255,170,0.85)';
      ctx.lineWidth = 3;
      ctx.arc(x, y, HOTSPOT_RADIUS_PX * 0.8, 0, Math.PI * 2);
      ctx.stroke();

      state.found.add(i);
    });
    setFeedback('Auto-placed markers for demo.');
    markCompleteIfReady();
  }

  // ---------- Hotspots JSON ----------
  function getHotspotMap() {
    const el = $('#phishingHotspots');
    if (!el) return {};
    try { return JSON.parse(el.textContent || '{}'); } catch { return {}; }
  }

  const HOTSPOTS = getHotspotMap();

  // ---------- Init image & canvas ----------
  function currentImageName() {
    // Prefer query string if present; else whatever src ends with; else default
    const params = new URLSearchParams(location.search);
    const q = params.get('img');
    if (q && /\.(png|jpe?g|webp|gif|svg)$/i.test(q)) return q;
    const src = imgEl.getAttribute('src') || '';
    const m = src.match(/([^/]+)$/);
    return m ? m[1] : DEFAULT_IMAGE;
  }

  function fitCanvasToImage() {
    // Set canvases to the rendered size of the image (not natural) so drawing aligns
    const rect = imgEl.getBoundingClientRect();
    const w = Math.max(100, Math.round(rect.width));
    const h = Math.max(100, Math.round(rect.height));

    drawCanvas.width  = w;
    drawCanvas.height = h;
    maskCanvas.width  = w;
    maskCanvas.height = h;

    // Percentage to pixel scale factors (in case we need natural size)
    state.scaleX = w / imgEl.naturalWidth;
    state.scaleY = h / imgEl.naturalHeight;

    // Reset visible overlay (we keep mask separately)
    ctx.clearRect(0, 0, w, h);
  }

  function loadHotspotsForImage() {
    state.imgName = currentImageName();
    state.hotspots = (HOTSPOTS[state.imgName] || []).map(h => ({
      xPct: Number(h.xPct), yPct: Number(h.yPct), label: h.label || 'Indicator'
    }));
    state.found.clear();
    updateVulnText();
  }

  // Convert pct hotspot to canvas pixel coords
  function pctToPx(h) {
    const rect = imgEl.getBoundingClientRect();
    const w = drawCanvas.width || rect.width;
    const hgt = drawCanvas.height || rect.height;
    return {
      x: Math.round(h.xPct * w),
      y: Math.round(h.yPct * hgt)
    };
  }

  function updateVulnText() {
    if (!vulnCountEl) return;
    const total = state.hotspots.length || 0;
    const found = state.found.size;
    if (total) {
      vulnCountEl.textContent = `You marked ${found} out of ${total} vulnerabilities.`;
    } else {
      vulnCountEl.textContent = 'No hotspots defined for this image.';
    }
  }

  function setFeedback(msg, ok=false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.classList.toggle('ok', !!ok);
    feedbackEl.classList.toggle('warn', !ok && !!msg);
    if (msg) announce(msg);
  }

  // ---------- Tools ----------
  function setTool(name) {
    state.tool = name === 'eraser' ? 'eraser' : 'brush';
    // Toggle aria-pressed on tool buttons if present
    $$('.tool-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === state.tool)));
    setFeedback(state.tool === 'brush' ? 'Brush selected' : 'Eraser selected');
  }
  window.setTool = setTool; // called by HTML buttons

  if (brushSizeEl) {
    state.size = Number(brushSizeEl.value) || 12;
    brushSizeEl.addEventListener('input', () => {
      state.size = Number(brushSizeEl.value) || 12;
    });
  }

  // ---------- Drawing (mouse + touch) ----------
  function getPos(evt) {
    const r = drawCanvas.getBoundingClientRect();
    if (evt.touches && evt.touches[0]) {
      const t = evt.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  function beginDraw(x, y) {
    state.drawing = true;
    state.lastX = x; state.lastY = y;
    drawStroke(x, y, true);
  }

  function endDraw() {
    state.drawing = false;
    // After stroke, recompute found hotspots
    recomputeFoundFromMask();
    markCompleteIfReady();
  }

  function moveDraw(x, y) {
    if (!state.drawing) return;
    drawStroke(x, y, false);
    state.lastX = x; state.lastY = y;
  }

  function drawStroke(x, y, first) {
    // Draw on visible canvas (nice stroke) AND mask canvas (solid circle/line)
    const size = state.size;

    // Visible
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    if (state.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(0,255,170,0.85)';
    }
    ctx.beginPath();
    if (first) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y + 0.01);
    } else {
      ctx.moveTo(state.lastX, state.lastY);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mask (always paint black for brush, erase to clear)
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';
    maskCtx.lineWidth = size;
    maskCtx.beginPath();
    if (state.tool === 'eraser') {
      maskCtx.globalCompositeOperation = 'destination-out';
      maskCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      maskCtx.globalCompositeOperation = 'source-over';
      maskCtx.strokeStyle = '#000';
    }
    if (first) {
      maskCtx.moveTo(x, y);
      maskCtx.lineTo(x + 0.01, y + 0.01);
    } else {
      maskCtx.moveTo(state.lastX, state.lastY);
      maskCtx.lineTo(x, y);
    }
    maskCtx.stroke();
  }

  // Events
  drawCanvas.addEventListener('mousedown', (e) => { const p = getPos(e); beginDraw(p.x, p.y); });
  drawCanvas.addEventListener('mousemove', (e) => { const p = getPos(e); moveDraw(p.x, p.y); });
  window.addEventListener('mouseup', endDraw);

  drawCanvas.addEventListener('touchstart', (e) => { const p = getPos(e); beginDraw(p.x, p.y); e.preventDefault(); }, { passive:false });
  drawCanvas.addEventListener('touchmove',  (e) => { const p = getPos(e); moveDraw(p.x, p.y);  e.preventDefault(); }, { passive:false });
  drawCanvas.addEventListener('touchend',   (e) => { endDraw(); e.preventDefault(); }, { passive:false });

  // ---------- Scoring ----------
  function recomputeFoundFromMask() {
    state.found.clear();
    const total = state.hotspots.length;
    if (!total) return;

    const imgData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;

    for (let i = 0; i < total; i++) {
      const { x, y } = pctToPx(state.hotspots[i]);
      if (anyInkNear(imgData, x, y, HOTSPOT_RADIUS_PX, maskCanvas.width, maskCanvas.height)) {
        state.found.add(i);
      }
    }
  }

  function anyInkNear(data, cx, cy, r, w, h) {
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    const r2 = r * r;

    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const row = y * w * 4;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx*dx + dy2 <= r2) {
          const idx = row + x * 4;
          // Mask draws black (#000) with alpha 255 — check alpha > 0
          if (data[idx + 3] > 0) return true;
        }
      }
    }
    return false;
  }

  function redrawFromMask() {
    // Light visual hint (optional) — we simply overlay the mask as a faint color
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(maskCanvas, 0, 0);
    // Convert black mask to green-ish tint
    const id = ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    const d = id.data;
    for (let i=0; i<d.length; i+=4) {
      const a = d[i+3];
      if (a > 0) {
        d[i]   = 0;   // R
        d[i+1] = 255; // G
        d[i+2] = 170; // B
        d[i+3] = Math.min(220, a); // alpha
      }
    }
    ctx.putImageData(id, 0, 0);
  }

  // ---------- Submit ----------
  function submitHighlights() {
    recomputeFoundFromMask();
    const total = state.hotspots.length;
    const found = state.found.size;
    const required = Math.ceil(total * REQUIRED_PCT);

    if (!total) {
      setFeedback('No hotspot map for this image, so scoring is disabled.');
      return;
    }

    if (found >= required) {
      setFeedback(`✅ Nice! You found ${found}/${total}.`, true);
      markCompleteIfReady(); // will set global progress if not already
    } else {
      setFeedback(`❌ You found ${found}/${total}. Keep looking (need ≥ ${required}).`);
    }
  }

  window.saveHighlights  = saveHighlights;
  window.loadHighlights  = loadHighlights;
  window.eraseAll        = eraseAll;
  window.selectAll       = selectAll;
  window.submitHighlights= submitHighlights;

  // ---------- Image lifecycle ----------
  function syncCanvasPositioning() {
    // Keep canvas aligned over the image within the scrollable stage
    const rImg = imgEl.getBoundingClientRect();
    const rStage = stageEl.getBoundingClientRect();
    // Not needed if canvas is positioned absolute inside stage at 0,0 — which it is
    // We just ensure sizing is correct:
    fitCanvasToImage();
    redrawFromMask(); // keep whatever we had painted
  }

  function drawDataUrlToCanvas(dataUrl, canvas, context) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { 
        const w = canvas.width, h = canvas.height;
        context.clearRect(0,0,w,h);
        // Draw scaled to current canvas size
        context.drawImage(img, 0, 0, w, h);
        resolve();
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function onImageReady() {
    loadHotspotsForImage();
    fitCanvasToImage();
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    state.found.clear();
    updateVulnText();
    // Try to load saved highlights for this image
    loadHighlights().catch(()=>{ /* ignore */ });
  }

  imgEl.addEventListener('load', onImageReady);

  // Resize observers to keep overlay aligned on responsive changes
  const ro = new ResizeObserver(() => syncCanvasPositioning());
  ro.observe(stageEl);

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Ensure tool button reflects default
    setTool('brush');

    // If src already set, onImageReady will fire on 'load'
    // If image is cached and 'load' won't fire, force sync:
    if (imgEl.complete && imgEl.naturalWidth) {
      onImageReady();
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') setTool('brush');
      if (e.key === 'e' || e.key === 'E') setTool('eraser');
      if (e.key === '[') { state.size = Math.max(6, state.size - 2); if (brushSizeEl) brushSizeEl.value = String(state.size); }
      if (e.key === ']') { state.size = Math.min(36, state.size + 2); if (brushSizeEl) brushSizeEl.value = String(state.size); }
    });
  });

})();
