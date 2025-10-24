/* encryption.js — Caesar puzzle logic (Cyber Escape Rooms)
   Works with encryption.html and (optionally) caesar.js

   What it does:
   - Sets/reads ciphertext
   - Shows live decoded output as shift changes
   - Validates final plaintext on submit
   - Marks puzzle complete in localStorage + logs time
*/

(function () {
  'use strict';

  // ---------- DOM helpers ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function announce(msg){ try{ window.a11y?.announce?.(msg); }catch(_){} }

  // ---------- Caesar helpers (fallback if caesar.js not present) ----------
  const Caesar = window.Caesar || (() => {
    const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
    const normalize = (s) => { let n = Number(s)||0; n%=26; if(n<0)n+=26; return n; };
    const encode = (text, shift) => {
      shift = normalize(shift);
      return (text||'').replace(/[a-z]/gi, ch=>{
        const u = ch>='A'&&ch<='Z', base = (u?65:97), code = ch.charCodeAt(0)-base;
        if (code<0 || code>25) return ch;
        return String.fromCharCode(base+((code+shift)%26));
      });
    };
    const decode = (t,s)=>encode(t,26-normalize(s));
    return { encode, decode, normalize };
  })();

  // ---------- Config ----------
  // If you have an existing config (from an older build), you can define:
  // window.ENCRYPTION_CONFIG = { plain: "THE SECRET PHRASE", shift: 7 };
  const CFG = window.ENCRYPTION_CONFIG || {
    plain:  "KNOWLEDGE IS POWER",
    shift:  5  // the wheel needs to be turned to this to reveal the plaintext
  };
  // Optional: provide a hash of the expected plaintext for stricter checking
  // Set EXPECTED_HASH to SHA-256(hex) of the normalized plaintext (normalizePlain()).
  const EXPECTED_HASH = window.ENCRYPTION_HASH || null;

  // Normalize what users type vs your answer (trim, collapse spaces, upper-case)
  function normalizePlain(s){
    return (s||'')
      .replace(/\s+/g,' ')
      .trim()
      .toUpperCase();
  }

  // Web Crypto SHA-256 (hex)
  async function sha256Hex(s) {
    const enc = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  // ---------- Elements ----------
  const cipherEl   = $('#cipherText');
  const liveEl     = $('#liveOutput');
  const sliderEl   = $('#shiftSlider');
  const shiftDown  = $('#shiftDown');
  const shiftUp    = $('#shiftUp');
  const shiftVal   = $('#shiftValue');
  const innerRing  = $('#innerRing');
  const submitBtn  = $('#submitBtn');
  const answerEl   = $('#finalAnswer');
  const feedbackEl = $('#encFeedback');
  const hintBtn    = $('#encHintBtn');
  const hintBox    = $('#encHintText');
  const vaultDisplay = $('#encVaultValue');
  function setVaultDigit(value) {
    if (!vaultDisplay) return;
    vaultDisplay.textContent = value ?? '—';
  }

  function updateVaultDigit(forceValue) {
    if (typeof forceValue === 'string') {
      setVaultDigit(forceValue);
      return;
    }
    try {
      const progress = window.utils?.readProgress?.() || {};
      const stored = localStorage.getItem('lock_digit_caesar_shift');
      if (progress.encryption && stored) {
        setVaultDigit(stored);
      } else {
        setVaultDigit('—');
      }
    } catch (_) {
      setVaultDigit('—');
    }
  }
  updateVaultDigit();

  if (!cipherEl || !liveEl) return; // not on this page

  // ---------- Timer ----------
  const t0 = Date.now();

  // ---------- Storage helpers ----------
  function readUser(){
    try{ return JSON.parse(localStorage.getItem('user')||'null'); }catch{ return null; }
  }
  function progressKey(user){ return `${user?.username||'team'}_progress`; }
  function timesKey(user){ return `${user?.username||'team'}_times`; }

  function markComplete(){
    const u = readUser(), pKey = progressKey(u);
    let p;
    try{ p = JSON.parse(localStorage.getItem(pKey)||'{}'); }catch{ p = {}; }
    p.encryption = true;
    localStorage.setItem(pKey, JSON.stringify(p));

    // Record time in seconds (append)
    const secs = Math.round((Date.now()-t0)/1000);
    let times;
    try{ times = JSON.parse(localStorage.getItem(timesKey(u))||'[]'); }catch{ times=[]; }
    times.push(secs);
    localStorage.setItem(timesKey(u), JSON.stringify(times));
  }

  // ---------- State & rendering ----------
  let currentShift = 0;
  let progressPercent = 0;
  const CIPHERTEXT = Caesar.encode(CFG.plain, CFG.shift); // what we show
  if (vaultDisplay) {
    vaultDisplay.textContent = String(CFG.shift);
  }

  const points = window.utils?.points;
  points?.ensure();
  let hintUsed = false;

  function updateProgressPercent(amount, opts = {}) {
    const setter = window.utils?.setProgressPercent;
    if (typeof setter !== 'function') return;
    const capped = Math.max(0, Math.min(100, Math.round(amount)));
    const complete = !!opts.complete;
    if (complete) {
      progressPercent = 100;
      setter('encryption', 100, { complete: true });
      return;
    }
    if (capped <= progressPercent) return;
    progressPercent = capped;
    setter('encryption', progressPercent, { complete: false });
  }

  function setCiphertext() {
    cipherEl.textContent = CIPHERTEXT;
  }

  function setShift(n){
    currentShift = Caesar.normalize(n);
    if (sliderEl) sliderEl.value = String(currentShift);
    if (shiftVal) shiftVal.textContent = String(currentShift);
    // Rotate ring if caesar.js rendered it (it will also emit caesar:shift)
    if (innerRing && !window.Caesar) {
      // simple visual fallback if caesar.js not loaded: rotate inner ring numerically (no letters)
      innerRing.setAttribute('aria-valuenow', String(currentShift));
    }
    updateLive();
    if (currentShift !== 0) {
      updateProgressPercent(20);
    }
    const normalizedShift = Caesar.normalize(CFG.shift);
    if (currentShift === normalizedShift) {
      updateProgressPercent(80);
    }
  }

  function updateLive(){
    // Live preview = decoding CIPHERTEXT with *current* shift (not fixed CFG.shift)
    const decoded = Caesar.decode(CIPHERTEXT, currentShift);
    liveEl.textContent = decoded;
  }

  // When caesar.js emits a shift change, mirror it here
  document.addEventListener('caesar:shift', (e) => {
    setShift(e?.detail?.shift ?? currentShift);
  });

  // Wire slider/± in case caesar.js isn’t present
  sliderEl?.addEventListener('input', () => setShift(Number(sliderEl.value)));
  shiftDown?.addEventListener('click', () => setShift(currentShift - 1));
  shiftUp  ?.addEventListener('click', () => setShift(currentShift + 1));

  // ---------- Validation ----------
  async function handleSubmit(){
    if (!answerEl) return;
    const userAnswer = normalizePlain(answerEl.value);
    const decodedNow = normalizePlain(Caesar.decode(CIPHERTEXT, currentShift));

    // Option A (strict): compare to EXPECTED_HASH if provided
    if (EXPECTED_HASH) {
      const h = await sha256Hex(userAnswer);
      if (h === EXPECTED_HASH) {
        success();
        return;
      }
    }

    // Option B (default): require that the current decoded text equals user’s input
    // AND that decoded text also matches the configured plaintext (robust against random shifts)
    const expectedPlain = normalizePlain(CFG.plain);
    if (userAnswer && userAnswer === decodedNow && decodedNow === expectedPlain) {
      success();
    } else {
      fail();
    }
  }

  function success(){
    if (feedbackEl){
      feedbackEl.textContent = `Correct! Shift ${CFG.shift} reveals the plaintext—record it as your vault digit.`;
      feedbackEl.classList.remove('warn');
      feedbackEl.classList.add('ok');
    }
    announce('Encryption puzzle solved');
    markComplete();
    updateProgressPercent(100, { complete: true });
    try {
      localStorage.setItem('lock_digit_caesar_shift', String(CFG.shift));
    } catch (_) {}
    updateVaultDigit(String(CFG.shift));
    window.vault?.unlock('encryption', CFG.shift, {
      message: `Encryption digit ${CFG.shift} unlocked. Add it to the vault.`
    });
  }

  function fail(){
    if (feedbackEl){
      feedbackEl.textContent = 'Not quite. Adjust the wheel or check spelling/casing.';
      feedbackEl.classList.remove('ok');
      feedbackEl.classList.add('warn');
    }
    announce('Try a different shift or check spelling');
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    setCiphertext();

    // Initialize shift from slider if present; else start at 0
    const start = sliderEl ? Number(sliderEl.value) : 0;
    setShift(isNaN(start) ? 0 : start);

    submitBtn?.addEventListener('click', handleSubmit);
    hintBtn?.addEventListener('click', () => {
      if (hintUsed) {
        if (feedbackEl) {
          feedbackEl.textContent = 'Hint already revealed.';
          feedbackEl.classList.remove('warn');
        }
        return;
      }
      hintUsed = true;
      hintBox?.removeAttribute('hidden');
      points?.spend(5, 'Encryption hint');
      if (feedbackEl) {
        feedbackEl.textContent = 'Hint revealed. Align the alphabets until real words appear.';
        feedbackEl.classList.remove('warn');
        feedbackEl.classList.add('ok');
      }
    });

    // Enter key in the answer box triggers submit
    answerEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    });

    window.utils?.initStatusHud('encryption', {
      score: '#encryptionPointsTotal',
      delta: '#encryptionPointsDelta',
      progressFill: '#encryptionProgressFill',
      progressLabel: '#encryptionProgressText'
    });
  });

})();
