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
  const prevBtn      = $('#prevImg');
  const nextBtn      = $('#nextImg');
  const slideStatus  = $('#slideStatus');
  const dotContainer = $('#exampleDots');
  const markPhishBtn = $('#markPhish');
  const markLegitBtn = $('#markLegit');
  const saveBtn      = $('#saveBtn');
  const loadBtn      = $('#loadBtn');
  const clearBtn     = $('#clearBtn');
  const selectAllBtn = $('#selectAllBtn');
  const hintBtn      = $('#phishHintBtn');
  const hintText     = $('#phishHintText');
  const vaultDisplay = $('#phishVaultValue');

  if (!imgEl || !drawCanvas) return; // not on this page

  const ctx = drawCanvas.getContext('2d', { willReadFrequently: true });

  // A hidden mask canvas we use for scoring (1-bit-ish)
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

  // ---------- Config ----------
  // How close (in pixels) the highlight must be to the hotspot center to count
  const HOTSPOT_RADIUS_PX = 28; // tuned for typical email screenshots
  const MAX_STROKE_LENGTH = 640; // pixels of travel per stroke
  const MAX_STROKE_SPAN = 260;   // max width/height of a single stroke highlight
  const MAX_STROKE_AREA = 52000; // approx area (px^2) before we consider it too large
  // Required proportion of hotspots on an image to count as "complete" for this puzzle
  const REQUIRED_PCT = 0.75;

// ---------- Config ----------
const IMAGES = ['Picture1.png','Picture2.png','Picture3.png','Picture4.png'];
const DEFAULT_IMAGE = IMAGES[0];

const IMAGE_LABELS = {
  'Picture1.png': 'Apple — “sound played”',
  'Picture2.png': 'iCloud — “storage full”',
  'Picture3.png': 'Amazon — “order confirmation”',
  'Picture4.png': 'SharePoint — “file shared”'
};

// Mark which images are truly phishing (used for digit #1 and auto-scoring)
// Adjust if your ground truth differs:
const IS_PHISHING = {
  'Picture1.png': true,   // iCloud tone email (phishy)
  'Picture2.png': true,   // iCloud full storage upsell (phishy)
  'Picture3.png': false,  // Amazon order confirmation (legit example)
  'Picture4.png': true    // SharePoint "file shared" lure (phishy)
};

// how many of the examples are phishing (for the lock digit #1)
function countPhishingGroundTruth() {
  return IMAGES.reduce((n, name) => n + (IS_PHISHING[name] ? 1 : 0), 0);
}
localStorage.setItem('lock_digit_phishing_total', String(countPhishingGroundTruth()));
if (vaultDisplay) {
  vaultDisplay.textContent = String(countPhishingGroundTruth());
}

  const points = window.utils?.points;
  points?.ensure();
  let hintUsed = false;

  hintBtn?.addEventListener('click', () => {
    if (hintUsed) {
      announce('Hint already revealed.');
      return;
    }
    hintUsed = true;
    hintText?.removeAttribute('hidden');
    points?.spend(5, 'Phishing hint');
    announce('Hint revealed. Focus on suspicious sender, link, and urgency cues.');
  });

  // Tool state
  const state = {
    tool: 'brush', // 'brush' | 'eraser'
    size: 8,
    drawing: false,
    lastX: 0,
    lastY: 0,
    strokeLength: 0,
    strokeBounds: null,
    maskSnapshot: null,
    scaleX: 1,
    scaleY: 1,
    hotspots: [],
    found: new Set(), // indexes of hotspots found
    imgName: DEFAULT_IMAGE
  };

  // Add slideshow state + helpers (keeps track of current email example)
  const slideshow = {
    index: 0,
    order: IMAGES.slice(),
    get total() { return this.order.length; },
    clamp(i) {
      if (!this.total) return 0;
      if (i < 0) return 0;
      if (i >= this.total) return this.total - 1;
      return i;
    },
    current() {
      return this.order[this.index] || DEFAULT_IMAGE;
    }
  };

  function currentName() {
    return slideshow.current();
  }

  function isImageComplete(name) {
    if (!name) return false;
    return localStorage.getItem(`phish_done_${name}`) === '1';
  }

  function updateSlideUi() {
    const current = currentName();
    const total = Math.max(slideshow.total, 1);
    if (slideStatus) {
      if (!slideshow.total) {
        slideStatus.textContent = 'No examples available.';
      } else {
        const label = IMAGE_LABELS[current] || current;
        slideStatus.textContent = `Example ${slideshow.index + 1} of ${total} — ${label}`;
      }
    }
    if (prevBtn) {
      prevBtn.disabled = slideshow.index <= 0;
      prevBtn.setAttribute('aria-disabled', prevBtn.disabled ? 'true' : 'false');
    }
    if (nextBtn) {
      nextBtn.disabled = slideshow.index >= slideshow.total - 1;
      nextBtn.setAttribute('aria-disabled', nextBtn.disabled ? 'true' : 'false');
    }

    // Highlight current link in the list nav (if present)
    $$('.thumb-nav a').forEach((link, i) => {
      if (slideshow.order[i]) {
        const isCurrent = slideshow.order[i] === current;
        const isDone = isImageComplete(slideshow.order[i]);
        link.classList.toggle('is-active', isCurrent);
        if (isCurrent) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
        link.classList.toggle('is-complete', isDone);
        link.setAttribute('data-complete', isDone ? 'true' : 'false');
        const label = link.textContent?.trim() || '';
        if (isDone) {
          link.setAttribute('aria-label', `${label} (complete)`);
        } else {
          if (link.getAttribute('aria-label')) link.removeAttribute('aria-label');
        }
      }
    });

    updateDotUi();
  }

  const dotButtons = [];

  function buildDots() {
    if (!dotContainer) return;
    dotContainer.innerHTML = '';
    dotButtons.length = 0;
    slideshow.order.forEach((name, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'carousel-dot';
      btn.id = `exampleDot-${idx}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('aria-label', `Show example ${idx + 1}: ${IMAGE_LABELS[name] || name}`);
      btn.title = IMAGE_LABELS[name] || name;
      btn.addEventListener('click', () => goto(idx));
      dotContainer.appendChild(btn);
      dotButtons.push(btn);
    });
    updateDotUi();
  }

  function updateDotUi() {
    if (!dotButtons.length) return;
    dotButtons.forEach((btn, idx) => {
      const isActive = slideshow.index === idx;
      const name = slideshow.order[idx];
      const isDone = isImageComplete(name);
      btn.classList.toggle('is-active', isActive);
      btn.classList.toggle('is-complete', isDone);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (isDone) {
        btn.setAttribute('data-complete', 'true');
        btn.setAttribute('aria-label', `Show example ${idx + 1}: ${(IMAGE_LABELS[name] || name)} (complete)`);
      } else {
        btn.removeAttribute('data-complete');
        btn.setAttribute('aria-label', `Show example ${idx + 1}: ${IMAGE_LABELS[name] || name}`);
      }
      if (isActive) {
        dotContainer?.setAttribute('aria-activedescendant', btn.id);
      }
    });
  }

  function goto(index) {
    if (!slideshow.total) return;
    slideshow.index = slideshow.clamp(index);
    const name = currentName();
    if (state.imgName === name) {
      updateSlideUi();
      return;
    }
    state.imgName = name;
    hintUsed = false;
    hintText?.setAttribute('hidden', 'hidden');
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('img', name);
      history.replaceState(null, '', url);
    } catch (_) {
      // ignore if URL parsing fails (older browsers)
    }
    syncClassificationUi();
    imgEl.setAttribute('data-loading', 'true');
    imgEl.src = `assets/${name}`;
    updateSlideUi();
  }

  function next() {
    if (slideshow.index >= slideshow.total - 1) return;
    goto(slideshow.index + 1);
  }

  function prev() {
    if (slideshow.index <= 0) return;
    goto(slideshow.index - 1);
  }

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
        setFeedback('Great work! You spotted enough phishing indicators. Digit earned.', 'success');
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
    setFeedback('Saved your highlights.', 'success');
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
      setFeedback('Loaded saved highlights.', 'success');
      markCompleteIfReady();
    } catch {
      setFeedback('Could not load saved highlights.', 'warn');
    }
  }

  function eraseAll() {
    resetStrokeState();
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
  function resolveInitialImage() {
    // Prefer query string if present; else whatever src ends with; else default
    const params = new URLSearchParams(location.search);
    const q = params.get('img');
    if (q && IMAGES.includes(q)) return q;
    const src = imgEl.getAttribute('src') || '';
    const m = src.match(/([^/]+)$/);
    if (m && IMAGES.includes(m[1])) return m[1];
    return DEFAULT_IMAGE;
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
    resetStrokeState();
    ctx.clearRect(0, 0, w, h);
  }

  function loadHotspotsForImage() {
    resetStrokeState();
    state.imgName = currentName();
    state.hotspots = (HOTSPOTS[state.imgName] || []).map(h => ({
      xPct: Number(h.xPct), yPct: Number(h.yPct), label: h.label || 'Indicator'
    }));
    state.found.clear();
    updateVulnText();
    syncClassificationUi();
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

  function broadcastProgress() {
    const setPercent = window.utils?.setProgressPercent;
    if (typeof setPercent !== 'function') return;
    const total = state.hotspots.length;
    if (!total) {
      setPercent('phishing', 0, { complete: false });
      return;
    }
    const found = state.found.size;
    const required = Math.ceil(total * REQUIRED_PCT);
    const percent = Math.round((found / total) * 100);
    setPercent('phishing', percent, { complete: found >= required });
  }

  function updateVulnText() {
    if (!vulnCountEl) return;
    const total = state.hotspots.length || 0;
    const found = state.found.size;
    if (total) {
      const required = Math.ceil(total * REQUIRED_PCT);
      const remaining = Math.max(total - found, 0);
      const needed = Math.max(required - found, 0);
      let extra = '';
      if (found === 0) {
        extra = ' Start highlighting the most suspicious clue you can find.';
      } else if (remaining > 0) {
        if (needed > 0) {
          extra = ` Keep hunting—${needed === 1 ? 'one more critical clue' : `${needed} more critical clues`} will meet the target.`;
        } else {
          extra = ` Nice work! ${remaining === 1 ? 'One bonus clue remains if you want the full sweep.' : `${remaining} bonus clues remain if you want the full sweep.`}`;
        }
      } else {
        extra = ' All clues are marked—excellent coverage!';
      }
      vulnCountEl.textContent = `You marked ${found} out of ${total} vulnerabilities.${extra}`;
    } else {
      vulnCountEl.textContent = 'No hotspots defined for this image.';
    }
    broadcastProgress();
  }

  function syncClassificationUi() {
    const saved = localStorage.getItem(`class_${currentName()}`);
    const isPhish = saved === 'phish';
    const isLegit = saved === 'legit';
    if (markPhishBtn) {
      markPhishBtn.setAttribute('aria-pressed', isPhish ? 'true' : 'false');
      markPhishBtn.classList.toggle('is-selected', isPhish);
    }
    if (markLegitBtn) {
      markLegitBtn.setAttribute('aria-pressed', isLegit ? 'true' : 'false');
      markLegitBtn.classList.toggle('is-selected', isLegit);
    }
  }

  function setFeedback(msg, tone='info') {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.classList.remove('ok', 'warn');
    if (!msg) {
      feedbackEl.removeAttribute('data-tone');
      return;
    }
    const normalized = tone === 'success' ? 'success' : tone === 'warn' ? 'warn' : 'info';
    if (normalized === 'success') feedbackEl.classList.add('ok');
    if (normalized === 'warn') feedbackEl.classList.add('warn');
    if (normalized === 'info') feedbackEl.removeAttribute('data-tone');
    else feedbackEl.setAttribute('data-tone', normalized);
    announce(msg);
  }

  // ---------- Tools ----------
  function setTool(name) {
    state.tool = name === 'eraser' ? 'eraser' : 'brush';
    // Toggle aria-pressed on tool buttons if present
    $$('.tool-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === state.tool)));
    setFeedback(state.tool === 'brush' ? 'Brush selected' : 'Eraser selected');
  }
  window.setTool = setTool; // called by HTML buttons

  const clampBrushSize = (val) => {
    const min = Number(brushSizeEl?.min || 2);
    const max = Number(brushSizeEl?.max || 24);
    const num = Math.round(Number(val) || 8);
    return Math.max(min, Math.min(max, num));
  };

  if (brushSizeEl) {
    state.size = clampBrushSize(brushSizeEl.value);
    brushSizeEl.addEventListener('input', () => {
      state.size = clampBrushSize(brushSizeEl.value);
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

  function resetStrokeState() {
    state.strokeLength = 0;
    state.strokeBounds = null;
    state.maskSnapshot = null;
  }

  function restoreMaskSnapshot() {
    if (state.maskSnapshot) {
      maskCtx.putImageData(state.maskSnapshot, 0, 0);
      redrawFromMask();
    }
  }

  function exceedsStrokeLimits() {
    if (!state.strokeBounds) return false;
    const width = Math.abs(state.strokeBounds.maxX - state.strokeBounds.minX);
    const height = Math.abs(state.strokeBounds.maxY - state.strokeBounds.minY);
    const area = width * height;
    return state.strokeLength > MAX_STROKE_LENGTH || width > MAX_STROKE_SPAN || height > MAX_STROKE_SPAN || area > MAX_STROKE_AREA;
  }

  function beginDraw(x, y) {
    state.drawing = true;
    state.lastX = x;
    state.lastY = y;
    state.strokeLength = 0;
    state.strokeBounds = { minX: x, maxX: x, minY: y, maxY: y };
    try {
      state.maskSnapshot = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    } catch {
      state.maskSnapshot = null;
    }
    drawStroke(x, y, true);
  }

  function finishStroke() {
    if (!state.drawing) return;
    state.drawing = false;
    if (exceedsStrokeLimits()) {
      restoreMaskSnapshot();
      setFeedback('Keep highlights focused on the suspicious detail, not the entire email.', 'warn');
      updateVulnText();
      resetStrokeState();
      return;
    }
    resetStrokeState();
    recomputeFoundFromMask();
    markCompleteIfReady();
  }

  function moveDraw(x, y) {
    if (!state.drawing) return;
    const dx = x - state.lastX;
    const dy = y - state.lastY;
    state.strokeLength += Math.hypot(dx, dy);
    if (state.strokeBounds) {
      state.strokeBounds.minX = Math.min(state.strokeBounds.minX, x);
      state.strokeBounds.maxX = Math.max(state.strokeBounds.maxX, x);
      state.strokeBounds.minY = Math.min(state.strokeBounds.minY, y);
      state.strokeBounds.maxY = Math.max(state.strokeBounds.maxY, y);
    }
    drawStroke(x, y, false);
    state.lastX = x;
    state.lastY = y;
    if (exceedsStrokeLimits()) {
      state.drawing = false;
      restoreMaskSnapshot();
      setFeedback('Keep highlights focused on the suspicious detail, not the entire email.', 'warn');
      resetStrokeState();
      updateVulnText();
    }
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
  window.addEventListener('mouseup', finishStroke);

  drawCanvas.addEventListener('touchstart', (e) => { const p = getPos(e); beginDraw(p.x, p.y); e.preventDefault(); }, { passive:false });
  drawCanvas.addEventListener('touchmove',  (e) => { const p = getPos(e); moveDraw(p.x, p.y);  e.preventDefault(); }, { passive:false });
  drawCanvas.addEventListener('touchend',   (e) => { finishStroke(); e.preventDefault(); }, { passive:false });
  drawCanvas.addEventListener('touchcancel',(e) => { finishStroke(); e.preventDefault(); }, { passive:false });

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
    const name = currentName();
    const total = state.hotspots.length;
    const found = state.found.size;
    const required = Math.ceil(total * REQUIRED_PCT);

    const userClass = localStorage.getItem(`class_${name}`); // phish|legit|null
    const truth = !!IS_PHISHING[name];

    // Require a classification
    if (!userClass) {
      setFeedback('Choose “Is phishing” or “Isn’t phishing” first.', 'warn');
      return;
    }
    // If they said phishing, require at least one highlight
    if (userClass === 'phish' && !maskHasAnyInk()) {
      setFeedback('Mark at least one suspicious indicator (highlight).', 'warn');
      return;
    }

    // Score: classification must match truth, and if phishing, highlights must meet threshold.
    const okClass = (userClass === 'phish') === truth;
    const okHotspots = truth ? (found >= required) : true;

    if (okClass && okHotspots) {
      setFeedback('Correct for this example.', 'success');

      // Track per-image completion to gate the overall puzzle
      localStorage.setItem(`phish_done_${name}`, '1');

      // If all images are done, mark puzzle complete
      const allDone = IMAGES.every(n => localStorage.getItem(`phish_done_${n}`) === '1');
      if (allDone) {
        markCompleteIfReady(); // also sets phishing flag
      }

      updateSlideUi();

      // Move to next image (cycle once)
      if (slideshow.index < slideshow.total - 1) next();
    } else {
      setFeedback('Not quite. Check your choice and highlights.', 'warn');
    }
  }


  window.saveHighlights  = saveHighlights;
  window.loadHighlights  = loadHighlights;
  window.eraseAll        = eraseAll;
  window.selectAll       = selectAll;
  window.submitHighlights= submitHighlights;

  function maskHasAnyInk(){
  const id = maskCtx.getImageData(0,0,maskCanvas.width,maskCanvas.height).data;
  for (let i=3;i<id.length;i+=4){ if(id[i]>0) return true; }
  return false;
}

function classify(isPhish){
  const name = currentName();
  localStorage.setItem(`class_${name}`, isPhish ? 'phish' : 'legit');

  if (isPhish && !maskHasAnyInk()){
    setFeedback('Mark at least one suspicious indicator before submitting.', 'warn');
    return;
  }
  setFeedback(isPhish ? 'Marked as phishing.' : 'Marked as not phishing.', 'success');
  syncClassificationUi();
}


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
    imgEl.removeAttribute('data-loading');
    loadHotspotsForImage();
    fitCanvasToImage();
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    state.found.clear();
    updateVulnText();
    updateSlideUi();
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

    // Determine starting slide from query/src
    const initialName = resolveInitialImage();
    const startIndex = Math.max(0, IMAGES.indexOf(initialName));
    slideshow.index = startIndex;
    state.imgName = currentName();
    buildDots();
    updateSlideUi();

    // Wire slideshow buttons & keyboard toggles
    prevBtn?.addEventListener('click', prev);
    nextBtn?.addEventListener('click', next);

    // Convert list links into in-page navigation
    $$('.thumb-nav a').forEach((link, idx) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        goto(idx);
      });
    });

    // Classification buttons
    markPhishBtn?.addEventListener('click', () => classify(true));
    markLegitBtn?.addEventListener('click', () => classify(false));

    // File operations
    saveBtn?.addEventListener('click', saveHighlights);
    loadBtn?.addEventListener('click', loadHighlights);
    clearBtn?.addEventListener('click', eraseAll);
    selectAllBtn?.addEventListener('click', () => {
      if (!confirm('Auto-place markers is intended for facilitators. Continue?')) {
        setFeedback('Manual practice keeps your skills sharp. Try highlighting the clues yourself.', 'warn');
        return;
      }
      selectAll();
    });
    submitBtn?.addEventListener('click', submitHighlights);

    window.utils?.initStatusHud('phishing', {
      score: '#phishPointsTotal',
      delta: '#phishPointsDelta',
      progressFill: '#phishProgressFill',
      progressLabel: '#phishProgressText'
    });

    // If src differs from the desired start, update it
    const desiredSrc = `assets/${state.imgName}`;
    if ((imgEl.getAttribute('src') || '').replace(/^assets\//, 'assets/') !== desiredSrc) {
      imgEl.src = desiredSrc;
    } else if (imgEl.complete && imgEl.naturalWidth) {
      onImageReady();
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'b' || e.key === 'B') setTool('brush');
      if (e.key === 'e' || e.key === 'E') setTool('eraser');
      if (e.key === '[') {
        state.size = clampBrushSize(state.size - 2);
        if (brushSizeEl) brushSizeEl.value = String(state.size);
      }
      if (e.key === ']') {
        state.size = clampBrushSize(state.size + 2);
        if (brushSizeEl) brushSizeEl.value = String(state.size);
      }
      if (e.key === 'ArrowLeft') { prev(); }
      if (e.key === 'ArrowRight') { next(); }
    });
  });

})();
