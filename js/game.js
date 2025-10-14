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
  function computeLockDigits(){
    const d1 = Number(localStorage.getItem('lock_digit_phishing_total') || 0);
    const d2 = Number(localStorage.getItem('lock_digit_caesar_shift') || 0);
    const d3 = Number(localStorage.getItem('lock_digit_pw_minutes') || localStorage.getItem('lock_digit_pw_clues') || 0);
    const d4 = 8;
    const d5 = Number(localStorage.getItem('lock_digit_binary') || 0);
    return [d1, d2, d3, d4, d5];
  }


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

  const PUZZLES = ['phishing','password','encryption','essential','binary'];

  function computeCompleted(p){
    return PUZZLES.reduce((n, key) => n + (p[key] ? 1 : 0), 0);
  }

  function renderProgress(){
    const p = readProgress();
    const meta = typeof window.utils?.readProgressMeta === 'function'
      ? window.utils.readProgressMeta()
      : {};
    const done = computeCompleted(p);

    // Text
    const status = $('#progressStatus');
    if (status) status.textContent = `${done}/${PUZZLES.length} puzzles completed`;

    // Bar
    const fill = $('#progressFill');
    if (fill) fill.style.width = `${(done/PUZZLES.length)*100}%`;

    const bar = $('.progress-bar');
    if (bar) {
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(PUZZLES.length));
      bar.setAttribute('aria-valuenow', String(done));
    }

    // Journey steps
    PUZZLES.forEach(k => {
      const el = $(`#step-${k}`);
      const btn = document.querySelector(`[data-puzzle="${k}"]`);
      const entry = meta?.[k];
      const percent = typeof entry?.percent === 'number'
        ? Math.max(0, Math.min(100, Math.round(entry.percent)))
        : (p[k] ? 100 : 0);

      if (btn) {
        const ratio = percent / 100;
        btn.style.setProperty('--progress-ratio', ratio.toFixed(2));
        btn.setAttribute('data-progress', String(percent));
        btn.classList.toggle('is-complete', !!p[k]);
        btn.setAttribute('aria-label', `${btn.textContent.trim()} — ${percent}% complete${p[k] ? ', solved' : ''}`);
      }

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
    if (code.length !== digits.length) {
      setFeedback(`Enter all ${digits.length} digits.`);
      return;
    }

    if (!allPuzzlesComplete()) {
      setFeedback(`Finish all ${PUZZLES.length} puzzles before unlocking the vault.`);
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

  // ---------- Scoreboard ---------------------------------------------------

  const scoreEl = $('#scoreTotal');
  const scoreLogBtn = $('#scoreLogBtn');
  const scoreLogPanel = $('#scoreLog');

  function fmtScoreLogEntry(entry) {
    const time = new Date(entry.at || Date.now());
    const delta = entry.delta || 0;
    const sign = delta >= 0 ? '+' : '−';
    const amount = Math.abs(delta);
    const date = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${date} ${sign}${amount}: ${entry.reason || 'update'} → ${entry.total}`;
  }

  function renderScoreLog() {
    if (!scoreLogPanel) return;
    const log = window.utils.points.log().slice().reverse();
    if (!log.length) {
      scoreLogPanel.textContent = 'No adjustments yet.';
      return;
    }
    scoreLogPanel.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'score-log__list';
    log.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = fmtScoreLogEntry(entry);
      ul.appendChild(li);
    });
    scoreLogPanel.appendChild(ul);
  }

  function updateScore(total) {
    if (!scoreEl) return;
    const t = total ?? window.utils.points.get();
    scoreEl.textContent = String(t).padStart(3, '0');
  }

  window.addEventListener('score:change', (ev) => {
    updateScore(ev?.detail?.total);
    if (scoreLogPanel && !scoreLogPanel.hasAttribute('hidden')) {
      renderScoreLog();
    }
  });

  function initScoreboard() {
    window.utils.points.ensure();
    updateScore();
    if (scoreLogBtn && scoreLogPanel) {
      scoreLogBtn.addEventListener('click', () => {
        const hidden = scoreLogPanel.hasAttribute('hidden');
        if (hidden) {
          renderScoreLog();
          scoreLogPanel.removeAttribute('hidden');
          scoreLogBtn.textContent = 'Hide log';
        } else {
          scoreLogPanel.setAttribute('hidden', 'hidden');
          scoreLogBtn.textContent = 'View log';
        }
      });
    }
  }

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
    const metaKey = `${user.username || 'team'}_progress_meta`;
    const pKey = progressKey(user);
    window.addEventListener('storage', (ev) => {
      if (!ev.key) return;
      if (ev.key === pKey || ev.key === metaKey) {
        renderProgress();
      }
    });
    const how = document.getElementById('lockHow');
    if (how){
        const [a,b,c,d,e] = computeLockDigits();
        how.textContent = `Hint: digits → (1) phishing count = ${a} • (2) shift = ${b} • (3) minutes to crack ≈ ${c} • (4) essential controls = ${d} • (5) binary product ones digit = ${e}`;
     }

    autoAdvanceWire();
    initScoreboard();

    unlockBtn?.addEventListener('click', tryUnlock);

    // Optional: allow pressing Enter in last digit to attempt unlock
    const lastDigit = digits[digits.length - 1];
    lastDigit?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
  });

})();
