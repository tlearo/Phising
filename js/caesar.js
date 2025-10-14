/* caesar.js — responsive Caesar wheel + helpers
   - Renders two rings into #outerRing and #innerRing
   - Syncs with #shiftSlider, #shiftUp, #shiftDown, #shiftValue
   - Emits "caesar:shift" custom event on document with detail { shift, map }
   - Exposes window.Caesar.{encode,decode,normalize}
*/

(function () {
  'use strict';

  // ---------- Public helpers ----------------------------------------------

  const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

  function normalizeShift(s) {
    let n = Number(s) || 0;
    n %= 26;
    if (n < 0) n += 26;
    return n;
  }

  function encode(text, shift) {
    shift = normalizeShift(shift);
    return (text || '').replace(/[a-z]/gi, ch => {
      const isUpper = ch >= 'A' && ch <= 'Z';
      const base = isUpper ? 'A'.charCodeAt(0) : 'a'.charCodeAt(0);
      const code = ch.charCodeAt(0) - base;
      const next = (code + shift) % 26;
      return String.fromCharCode(base + next);
    });
  }

  function decode(text, shift) {
    return encode(text, 26 - normalizeShift(shift));
  }

  // Expose public API
  window.Caesar = { encode, decode, normalize: normalizeShift, ALPHA };

  // ---------- Wheel renderer ----------------------------------------------

  function $(sel, root = document) { return root.querySelector(sel); }

  const els = {
    wheelWrap: $('#wheelWrap'),
    outer: $('#outerRing'),
    inner: $('#innerRing'),
    slider: $('#shiftSlider'),
    decBtn: $('#shiftDown'),
    incBtn: $('#shiftUp'),
    value: $('#shiftValue'),
    cipherText: $('#cipherText'),
    liveOutput: $('#liveOutput')
  };

  if (!els.outer || !els.inner) {
    // Not on the encryption page — exit quietly.
    return;
  }

  const state = {
    shift: 0,
    letters: 26,
    degPer: 360 / 26,
    sizePx: 260 // base diameter; we compute with container width
  };

  function renderRings() {
    // Build ring letters once
    els.outer.innerHTML = '';
    els.inner.innerHTML = '';

    const build = (container, letters, { kind, upper }) => {
      for (let i = 0; i < letters.length; i++) {
        const glyph = document.createElement('span');
        glyph.className = `glyph ${kind}`;

        const letterSpan = document.createElement('span');
        letterSpan.className = 'glyph__letter';
        letterSpan.textContent = upper ? letters[i].toUpperCase() : letters[i].toLowerCase();
        glyph.appendChild(letterSpan);

        const indexSpan = document.createElement('span');
        indexSpan.className = 'glyph__index';
        indexSpan.textContent = String(i);
        glyph.appendChild(indexSpan);

        container.appendChild(glyph);
      }
    };

    build(els.outer, ALPHA, { kind: 'outer', upper: true });
    build(els.inner, ALPHA, { kind: 'inner', upper: true });

    layoutRings();
    updateRotation();
  }

  function layoutRings() {
    // Position letters around a circle.
    // Use the smaller of container width/height.
    const wrap = els.wheelWrap || els.outer.parentElement;
    const rect = wrap.getBoundingClientRect();
    const size = Math.max(180, Math.min(rect.width, rect.height));
    state.sizePx = size;

    const radiusOuter = size * 0.45;
    const radiusInner = size * 0.33;

    const outerLetters = Array.from(els.outer.children);
    const innerLetters = Array.from(els.inner.children);

    outerLetters.forEach((el, i) => {
      const angle = (i * state.degPer) - 90;
      const rad = angle * Math.PI / 180;
      const x = Math.cos(rad) * radiusOuter;
      const y = Math.sin(rad) * radiusOuter;
      placeLetter(el, x, y, angle + 90, size);
    });

    innerLetters.forEach((el, i) => {
      const angle = (i * state.degPer) - 90;
      const rad = angle * Math.PI / 180;
      const x = Math.cos(rad) * radiusInner;
      const y = Math.sin(rad) * radiusInner;
      // inner letters rotate with the ring but stay upright -> same upright transform
      placeLetter(el, x, y, angle + 90, size);
    });
  }

  function placeLetter(el, x, y, uprightDeg, size) {
    // Center origin
    const cx = size / 2, cy = size / 2;
    el.style.position = 'absolute';
    el.style.left = `${cx + x}px`;
    el.style.top = `${cy + y}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${uprightDeg}deg)`;
    el.style.transformOrigin = 'center';
    el.style.userSelect = 'none';
    el.style.pointerEvents = 'none';
  }

  function updateRotation() {
    const deg = -state.shift * state.degPer; // negative to align Caesar shift visual
    els.inner.style.transform = `rotate(${deg}deg)`;
    // Keep inner letters upright by compensating in CSS — we already rotate each letter upright in layoutRings
    // Update ARIA
    els.inner.setAttribute('aria-valuenow', String(state.shift));
    if (els.value) els.value.textContent = String(state.shift);

    // Dispatch a custom event with the mapping table
    const map = {};
    for (let i = 0; i < 26; i++) {
      const plain = ALPHA[i];
      const cipher = ALPHA[(i + state.shift) % 26];
      map[plain] = cipher;
      map[plain.toUpperCase()] = cipher.toUpperCase();
    }
    document.dispatchEvent(new CustomEvent('caesar:shift', { detail: { shift: state.shift, map } }));

    // Live output preview
    if (els.cipherText && els.liveOutput) {
      const ctext = els.cipherText.textContent || '';
      els.liveOutput.textContent = decode(ctext, state.shift);
    }
  }

  function setShift(n) {
    state.shift = normalizeShift(n);
    if (els.slider) els.slider.value = String(state.shift);
    updateRotation();
  }

  // ---------- Controls wiring ---------------------------------------------

  function initControls() {
    // Slider
    if (els.slider) {
      els.slider.min = '0';
      els.slider.max = '25';
      els.slider.value = String(state.shift);
      els.slider.addEventListener('input', () => setShift(Number(els.slider.value)));
      els.slider.addEventListener('change', () => setShift(Number(els.slider.value)));
    }

    // Buttons
    els.decBtn?.addEventListener('click', () => setShift(state.shift - 1));
    els.incBtn?.addEventListener('click', () => setShift(state.shift + 1));

    // Keyboard on inner ring
    els.inner.setAttribute('tabindex', '0');
    els.inner.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setShift(state.shift - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setShift(state.shift + 1); }
      if (e.key === 'Home') { e.preventDefault(); setShift(0); }
      if (e.key === 'End') { e.preventDefault(); setShift(25); }
    });

    // Mouse wheel over wheel to change shift
    (els.wheelWrap || els.inner).addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      setShift(state.shift + dir);
    }, { passive: false });
  }

  // ---------- Resize handling (throttled) ---------------------------------

  function throttle(fn, ms) {
    let t = 0;
    return function () {
      const now = Date.now();
      if (now - t > ms) {
        t = now;
        fn();
      }
    };
  }

  const onResize = throttle(() => {
    layoutRings();
    updateRotation();
  }, 100);

  // ---------- Boot ---------------------------------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    // Make ring containers square using wheelWrap size or fallback
    if (els.wheelWrap) {
      const obs = new ResizeObserver(onResize);
      obs.observe(els.wheelWrap);
    } else {
      window.addEventListener('resize', onResize);
    }
    renderRings();
    initControls();

    // Initialize from any pre-set slider value
    if (els.slider) setShift(Number(els.slider.value));
    else updateRotation();
  });

})();
