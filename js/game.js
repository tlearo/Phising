/* game.js — Cyber Escape Rooms (Game Hub + Vault Lock)
   - Renders overall progress and journey
   - Handles 4-digit lock with SHA-256 hash compare
   - Requires all puzzles complete before unlocking
*/

(function () {
  'use strict';

  // -------------------- Config --------------------------------------------

  // Option A: set a cleartext code (for local testing only). If present, we'll hash it at runtime.
  // window.VAULT_CODE = "1234";

  // Option B (preferred): keep only the SHA-256 hash of the 4-digit code here.
  // Replace this string with the hash of your real code:
  // echo -n 1234 | shasum -a 256
  const CORRECT_CODE_HASH = window.VAULT_CODE_HASH || "REPLACE_WITH_SHA256_OF_CODE";

  // -------------------- DOM helpers ---------------------------------------

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function announce(msg){ try{ window.a11y?.announce?.(msg); }catch(_){} }

  // -------------------- Storage / user ------------------------------------

  function readUser(){
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }

  function progressKey(user){ return `${user?.username || 'team'}_progress`; }

  function readProgress(){
    const u = readUser();
    try {
      return JSON.parse(localStorage.getItem(progressKey(u)) || '{}');
    } catch {
      return {};
    }
  }

  // -------------------- Team display --------------------------------------

  function renderTeamName(){
    const user = readUser();
    const el = $('#teamName');
    if (!el) return;
    const name = user?.username ? user.username.toUpperCase() : 'TEAM';
    el.textContent = name;
  }

  // -------------------- Progress rendering --------------------------------

  const PUZZLES = ['phishing','password','encryption','essential'];

  function computeCompleted(p){
    return PUZZLES.reduce((n, key) => n + (p[key] ? 1 : 0), 0);
  }

  function renderProgress(){
    const p = readProgress();
    const done = computeCompleted(p);

    // Text
    const status = $('#progressStatus');
    if (status) status.textContent = `${done}/4 puzzles completed`;

    // Bar
    const fill = $('#progressFill');
    if (fill) fill.style.width = `${(done/4)*100}%`;

    const bar = $('.progress-bar');
    if (bar) {
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '4');
      bar.setAttribute('aria-valuenow', String(done));
    }

    // Journey steps
    PUZZLES.forEach(k => {
      const el = $(`#step-${k}`);
      if (!el) return;
      if (p[k]) el.classList.add('done');
      else el.classList.remove('done');
    });
  }

  // -------------------- Lock helpers --------------------------------------

  const digits = $$('.lock-digit');
  const unlockBtn = $('#unlockBtn');
  const clearBtn  = $('#clearCodeBtn');
  const chest     = $('#vaultChest');
  const feedback  = $('#lockFeedback');
  const openBtn   = $('#lockOpenBtn');

  function setFeedback(msg, good=false){
    if (!feedback) return;
    feedback.textContent = msg || '';
    feedback.classList.toggle('ok', !!good);
    feedback.classList.toggle('warn', !good && !!msg);
    if (msg) announce(msg);
  }

  function getCode(){
    return digits.map(i => (i.value || '').trim()).join('');
  }

  function clearCode(){
    digits.forEach(d => d.value = '');
    digits[0]?.focus();
    setFeedback('');
  }

  function autoAdvanceWire(){
    digits.forEach((input, idx) => {
      input.setAttribute('maxlength','1');

      input.addEventListener('input', (e) => {
        const v = input.value.replace(/\D/g, '');
        input.value = v.slice(-1); // keep last digit only
        if (v && idx < digits.length - 1) digits[idx+1].focus();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          digits[idx-1].focus();
          digits[idx-1].value = '';
          e.preventDefault();
        }
        if (e.key === 'ArrowLeft' && idx > 0) { digits[idx-1].focus(); e.preventDefault(); }
        if (e.key === 'ArrowRight' && idx < digits.length-1) { digits[idx+1].focus(); e.preventDefault(); }
      });

      // Allow pasting all 4 digits at once
      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (!text) return;
        e.preventDefault();
        const numbers = (text.match(/\d/g) || []).slice(0, 4);
        numbers.forEach((n, j) => { if (digits[j]) digits[j].value = n; });
        digits[Math.min(numbers.length, 3)]?.focus();
      });
    });

    clearBtn?.addEventListener('click', clearCode);
  }

  // SHA-256 hex
  async function sha256Hex(s){
    const enc = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // If developer provided cleartext via window.VAULT_CODE, derive hash at runtime
  let derivedHashPromise = null;
  if (typeof window.VAULT_CODE === 'string' && window.VAULT_CODE.length === 4) {
    derivedHashPromise = sha256Hex(window.VAULT_CODE);
  }

  async function correctHash(){
    if (derivedHashPromise) return derivedHashPromise;
    return CORRECT_CODE_HASH;
  }

  function allPuzzlesComplete(){
    const p = readProgress();
    return PUZZLES.every(k => !!p[k]);
  }

  async function tryUnlock(){
    const code = getCode();
    if (code.length !== 4) {
      setFeedback('Enter all 4 digits.');
      return;
    }

    if (!allPuzzlesComplete()) {
      setFeedback('Finish all four puzzles before unlocking the vault.');
      return;
    }

    const expect = await correctHash();
    if (!expect || expect === 'REPLACE_WITH_SHA256_OF_CODE') {
      setFeedback('Vault not configured yet. Ask your facilitator to set the code.', false);
      return;
    }

    const h = await sha256Hex(code);
    if (h === expect) {
      setFeedback('✅ Vault unlocked!', true);
      chest?.classList.add('open'); // your CSS animates this
      openBtn?.setAttribute('aria-label', 'Vault open');
      announce('Vault unlocked');
    } else {
      setFeedback('❌ Incorrect code. Keep playing to confirm your digits.');
    }
  }

  // -------------------- Logout glue (fallback) -----------------------------

  function ensureLogout(){
    if (typeof window.logout === 'function') return;
    window.logout = function () {
      localStorage.clear();
      window.location.href = 'index.html';
    };
  }

  // -------------------- Boot ----------------------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    // Session guard (teams only)
    const user = readUser();
    if (!user || user.role !== 'team') {
      window.location.href = 'index.html';
      return;
    }

    ensureLogout();
    renderTeamName();
    renderProgress();
    autoAdvanceWire();

    unlockBtn?.addEventListener('click', tryUnlock);

    // Optional: allow pressing Enter in last digit to attempt unlock
    digits[3]?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
  });

})();
