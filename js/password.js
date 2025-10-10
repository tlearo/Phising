/* password.js — Password Puzzle (Cyber Escape Rooms)
   - Progressive clues (Next / Reset)
   - Guess validation (cleartext OR optional SHA-256 hash)
   - Marks completion in localStorage for current user
   - Logs elapsed time (seconds) into ${username}_times
*/

(function () {
  'use strict';

  // ---------------- Config ----------------
  // You can override these before this script loads:
  // window.PASSWORD_CONFIG = { answer: 'password123', clues: [ '...', '...' ] }
  // window.PASSWORD_HASH   = '<sha256 hex of normalized answer>';  // optional strict check
  //
  // Normalization: trim, collapse spaces, lowercase.

  const DEFAULT_CLUES = [
    'It’s on every “worst passwords” list.',
    'It’s all lowercase letters.',
    'It contains the word itself.',
    'Sometimes people tack numbers on the end…',
    'You’ve probably tried it already 😉'
  ];

  const CFG = window.PASSWORD_CONFIG || {
    answer: 'password',
    clues: DEFAULT_CLUES
  };

  const EXPECTED_HASH = window.PASSWORD_HASH || null;

  // ---------------- Helpers ----------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const announce = (m) => { try { window.a11y?.announce?.(m); } catch (_) {} };

  function normalize(s) {
    return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  async function sha256Hex(s) {
    const data = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // current user + storage keys
  function readUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }
  function progressKey(u) { return `${u?.username || 'team'}_progress`; }
  function timesKey(u)    { return `${u?.username || 'team'}_times`; }

  function markComplete(startTimeMs) {
    const u = readUser();
    const pKey = progressKey(u);
    let p;
    try { p = JSON.parse(localStorage.getItem(pKey) || '{}'); } catch { p = {}; }
    p.password = true;
    localStorage.setItem(pKey, JSON.stringify(p));

    // time logging
    const secs = Math.round((Date.now() - startTimeMs) / 1000);
    let times;
    try { times = JSON.parse(localStorage.getItem(timesKey(u)) || '[]'); } catch { times = []; }
    times.push(secs);
    localStorage.setItem(timesKey(u), JSON.stringify(times));
  }

  // ---------------- Elements ----------------
  const clueList       = $('#clueList');
  const nextClueBtn    = $('#nextClueBtn');
  const resetCluesBtn  = $('#resetCluesBtn');

  const guessInput     = $('#pwGuess');
  const submitBtn      = $('#submitGuessBtn');
  const clearBtn       = $('#clearGuessBtn');

  const feedbackEl     = $('#pwFeedback');

  if (!clueList || !guessInput) return; // not on this page

  // Timer start
  const t0 = Date.now();

  // ---------------- Clues logic ----------------
  let shown = 0;

  function renderClues(count) {
    clueList.innerHTML = '';
    for (let i = 0; i < count && i < CFG.clues.length; i++) {
      const li = document.createElement('li');
      li.className = 'clue';
      li.textContent = CFG.clues[i];
      clueList.appendChild(li);
    }
    if (count === 0) {
      const li = document.createElement('li');
      li.className = 'clue muted';
      li.textContent = 'Click “Reveal next clue” to begin.';
      clueList.appendChild(li);
    }
  }

  function revealNextClue() {
    if (shown < CFG.clues.length) {
      shown++;
      renderClues(shown);
      announce('Clue revealed');
      // Move focus back to the guess box to encourage attempts
      guessInput.focus();
    } else {
      announce('All clues revealed');
    }
  }

  function resetClues() {
    shown = 0;
    renderClues(shown);
    setFeedback('');
    announce('Clues reset');
  }

  // ---------------- Feedback ----------------
  function setFeedback(msg, ok = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.classList.toggle('ok', !!ok);
    feedbackEl.classList.toggle('warn', !ok && !!msg);
    if (msg) announce(msg);
  }

  // ---------------- Validation ----------------
  async function handleSubmit() {
    const userGuess = normalize(guessInput.value);
    if (!userGuess) {
      setFeedback('Please enter your guess.');
      guessInput.focus();
      return;
    }

    // strict hash route (if provided)
    if (EXPECTED_HASH) {
      const h = await sha256Hex(userGuess);
      if (h === EXPECTED_HASH) {
        return success();
      }
      return fail();
    }

    // default: compare normalized strings
    if (userGuess === normalize(CFG.answer)) {
      return success();
    }
    return fail();
  }

  function success() {
    setFeedback('✅ Correct! You earned a digit for the vault.', true);
    markComplete(t0);
    // Optional: lock inputs to avoid repeated submissions
    guessInput.setAttribute('disabled', 'true');
    submitBtn?.setAttribute('disabled', 'true');
  }

  function fail() {
    setFeedback('❌ Not quite. Try another guess or reveal another clue.');
  }

  // ---------------- Wiring ----------------
  document.addEventListener('DOMContentLoaded', () => {
    renderClues(shown);

    nextClueBtn   ?.addEventListener('click', revealNextClue);
    resetCluesBtn ?.addEventListener('click', resetClues);

    submitBtn     ?.addEventListener('click', handleSubmit);
    clearBtn      ?.addEventListener('click', () => {
      guessInput.value = '';
      setFeedback('');
      guessInput.focus();
    });

    // Enter key submits
    guessInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    });
  });

})();
