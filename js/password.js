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
  // window.PASSWORD_CONFIG = { answer: 'password123', clues: [ '...', '...' ], label: 'Custom', bonusHint: '...', crackSeconds: 180 }
  // window.PASSWORD_HASH   = '<sha256 hex of normalized answer>';  // optional strict check
  //
  // Normalization: trim, collapse spaces, lowercase.

  const HINT_COST = 5;
  const BONUS_HINT_COST = 5;
  const WRONG_COST = 5;
  const SPEED_REWARD_BANDS = [
    { threshold: 45, points: 24, label: 'Lightning solve bonus' },
    { threshold: 90, points: 18, label: 'Quick solve bonus' },
    { threshold: 180, points: 14, label: 'Steady solve bonus' },
    { threshold: Infinity, points: 10, label: 'Solved' }
  ];
  const Strength = window.PasswordStrength;
  if (!Strength) {
    console.error('PasswordStrength helper missing. Ensure js/password-strength.js is loaded before password.js');
    return;
  }

  const SCENARIOS = [
    {
      id: 'password',
      label: 'The obvious choice',
      answer: 'password',
      clues: [
        'It sits on every “worst passwords” list.',
        'It is all lowercase letters.',
        'It literally describes itself.',
        'You can type it with one hand.',
        'Sometimes people tack numbers on the end…'
      ],
      bonusHint: 'No symbols, no numbers — just the word itself.',
      crackSeconds: 3
    },
    {
      id: 'dragon',
      label: 'Fantasy fan favourite',
      answer: 'dragon',
      clues: [
        'This creature hoards treasure.',
        'Game of Thrones and D&D players love it.',
        'It breathes fire.',
        'Six lowercase letters.',
        'Think medieval beasts.'
      ],
      bonusHint: 'You might see it guarding a castle in a fairy tale.',
      crackSeconds: 45
    },
    {
      id: 'football',
      label: 'Sportsball super-fan',
      answer: 'football',
      clues: [
        'Americans yell this on Sundays.',
        'Eight letters, all lowercase.',
        'It involves touchdowns.',
        'Starts with a body part you can kick with.',
        'Popular in fantasy leagues too.'
      ],
      bonusHint: 'Pigskin, helmets, touchdowns.',
      crackSeconds: 95
    },
    {
      id: 'iloveyou',
      label: 'Hopeless romantic',
      answer: 'iloveyou',
      clues: [
        'Three words compressed into one.',
        'Lowercase letters only.',
        'People type it into texts a lot.',
        'No spaces, just affection.',
        'It ends with the word “you”.'
      ],
      bonusHint: 'Commonly said on Valentine’s Day.',
      crackSeconds: 140
    },
    {
      id: 'qwerty123',
      label: 'Keyboard shortcut',
      answer: 'qwerty123',
      clues: [
        'Starts at the top-left of a keyboard.',
        'Finishes with a short counting sequence.',
        'People use it because it is easy to type.',
        'Mixes letters then numbers.',
        'Rhymes with “wordy”.'
      ],
      bonusHint: 'Look at the first six keys on your keyboard.',
      crackSeconds: 220
    }
  ];

  const SCENARIO_KEY = 'password_scenario_index';

  function pickScenario() {
    if (window.PASSWORD_CONFIG) {
      const conf = window.PASSWORD_CONFIG;
      return {
        id: 'custom',
        label: conf.label || 'Custom challenge',
        answer: conf.answer || 'password',
        clues: Array.isArray(conf.clues) && conf.clues.length ? conf.clues : ['Try asking your facilitator for clues.'],
        bonusHint: conf.bonusHint || null,
        crackSeconds: Number(conf.crackSeconds) || 120
      };
    }

    let idx = Number(localStorage.getItem(SCENARIO_KEY));
    if (!Number.isInteger(idx) || !SCENARIOS[idx]) {
      idx = Math.floor(Math.random() * SCENARIOS.length);
      localStorage.setItem(SCENARIO_KEY, String(idx));
    }
    return SCENARIOS[idx];
  }

  const ACTIVE_SCENARIO = pickScenario();

  const CFG = {
    answer: ACTIVE_SCENARIO.answer,
    clues: ACTIVE_SCENARIO.clues
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

  function rewardForSolve(seconds) {
    for (const band of SPEED_REWARD_BANDS) {
      if (seconds <= band.threshold) return band;
    }
    return SPEED_REWARD_BANDS[SPEED_REWARD_BANDS.length - 1];
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
    return secs;
  }

  // ---------------- Elements ----------------
  const scoreTotalEl   = $('#pwScoreTotal');
  const scoreChangeEl  = $('#pwScoreChange');
  const clueCostLabel  = $('#pwClueCostLabel');
  const hintCostEl     = $('#pwHintCost');
  const scenarioLabelEl= $('#pwScenarioLabel');
  const crackTimeEl    = $('#pwCrackTime');
  const vaultDigitEl   = $('#pwVaultDigit');
  const crackMeterEl   = $('#pwStrengthMeter');
  const bonusHintBtn   = $('#pwHintBtn');
  const bonusHintEl    = $('#pwBonusHint');
  const vaultCalloutDigit = $('#passwordVaultDigitDisplay');

  const clueList       = $('#clueList');
  const nextClueBtn    = $('#nextClueBtn');
  const resetCluesBtn  = $('#resetCluesBtn');

  const guessInput     = $('#pwGuess');
  const submitBtn      = $('#submitGuessBtn');
  const clearBtn       = $('#clearGuessBtn');

  const feedbackEl     = $('#pwFeedback');

  if (!clueList || !guessInput) return; // not on this page

  const points = window.utils?.points;
  points?.ensure();

  function updateScoreDisplay(total = points?.get(), delta = 0) {
    if (scoreTotalEl) scoreTotalEl.textContent = String(total ?? 0).padStart(3, '0');
    if (scoreChangeEl) {
      if (!delta) scoreChangeEl.textContent = '';
      else scoreChangeEl.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta)} pts`;
    }
  }

  window.addEventListener('score:change', (ev) => {
    const detail = ev?.detail || {};
    updateScoreDisplay(detail.total, detail.delta);
  });

  updateScoreDisplay(points?.get(), 0);

  if (clueCostLabel) clueCostLabel.textContent = `Each extra clue costs ${HINT_COST} pts`;
  if (hintCostEl) hintCostEl.textContent = String(BONUS_HINT_COST);
  if (scenarioLabelEl) scenarioLabelEl.textContent = ACTIVE_SCENARIO.label;
  const crackTimeDisplay = Strength.formatCrackTime(ACTIVE_SCENARIO.crackSeconds);
  if (crackTimeEl) crackTimeEl.textContent = crackTimeDisplay;
  const vaultMinutes = Math.max(1, Math.round(ACTIVE_SCENARIO.crackSeconds / 60));
  if (crackMeterEl) crackMeterEl.value = Strength.strengthScale(ACTIVE_SCENARIO.crackSeconds);
  function setVaultDigitDisplayInternal(value) {
    const finalValue = value ? String(value) : '—';
    if (vaultDigitEl) vaultDigitEl.textContent = finalValue;
    if (vaultCalloutDigit) vaultCalloutDigit.textContent = finalValue;
  }

  function updateVaultDigitDisplay(forceValue) {
    if (forceValue) {
      setVaultDigitDisplayInternal(forceValue);
      return;
    }
    try {
      const progress = window.utils?.readProgress?.() || {};
      const stored = localStorage.getItem('lock_digit_pw_minutes');
      if (progress.password && stored) {
        setVaultDigitDisplayInternal(stored);
      } else {
        setVaultDigitDisplayInternal('—');
      }
    } catch (_) {
      setVaultDigitDisplayInternal('—');
    }
  }
  updateVaultDigitDisplay();
  if (!ACTIVE_SCENARIO.bonusHint && bonusHintBtn) {
    bonusHintBtn.setAttribute('disabled', 'true');
    bonusHintBtn.textContent = 'No bonus hint available';
  }

  const passwordDigit = Strength.crackSecondsToDigit(ACTIVE_SCENARIO.crackSeconds);
  let bonusHintUsed = false;

  // Timer start
  const t0 = Date.now();

  // ---------------- Clues logic ----------------
  let shown = 0;
  let progressPercent = 0;

  function updateProgressPercent(amount, opts = {}) {
    const setter = window.utils?.setProgressPercent;
    if (typeof setter !== 'function') return;
    const capped = Math.max(0, Math.min(100, Math.round(amount)));
    if (opts.complete) {
      progressPercent = 100;
      setter('password', 100, { complete: true });
      return;
    }
    if (opts.reset) {
      progressPercent = capped;
      setter('password', capped, { complete: false });
      return;
    }
    if (capped <= progressPercent) return;
    progressPercent = capped;
    setter('password', progressPercent, { complete: false });
  }

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
    const base = CFG.clues.length ? Math.round((count / CFG.clues.length) * 60) : 0;
    updateProgressPercent(base, { reset: count === 0 });
  }

  function revealNextClue() {
    if (shown >= CFG.clues.length) {
      announce('All clues revealed');
      return;
    }
    shown++;
    renderClues(shown);
    if (shown > 1) {
      points?.spend(HINT_COST, 'Password clue revealed');
    }
    announce('Clue revealed');
    guessInput.focus();
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
    const solveSeconds = markComplete(t0);
    const reward = rewardForSolve(solveSeconds);
    if (points) {
      points.add(reward.points, `${reward.label} (${Strength.formatCrackTime(solveSeconds)})`);
    }
    localStorage.setItem('lock_digit_pw_clues', String(shown)); // backwards compatibility
    localStorage.setItem('lock_digit_pw_minutes', String(passwordDigit));
    localStorage.setItem('password_crack_time_display', crackTimeDisplay);
    localStorage.removeItem(SCENARIO_KEY);
    const minutesText = vaultMinutes === 1 ? '1 minute' : `${vaultMinutes} minutes`;
    const message = `Success! You cracked it in ${Strength.formatCrackTime(solveSeconds)}. Record ${minutesText} (vault digit ${passwordDigit}) for the chest. +${reward.points} pts.`;
    setFeedback(message, true);
    updateProgressPercent(100, { complete: true });
    updateVaultDigitDisplay(String(passwordDigit));
    window.vault?.unlock('password', passwordDigit, {
      message: `Password digit ${passwordDigit} unlocked. Note the rounded minutes for the vault.`
    });
    // Optional: lock inputs to avoid repeated submissions
    guessInput.setAttribute('disabled', 'true');
    submitBtn?.setAttribute('disabled', 'true');
    bonusHintBtn?.setAttribute('disabled', 'true');
    try {
      const testerFrame = document.querySelector('.pw-strength-frame iframe');
      testerFrame?.contentWindow?.postMessage({ type: 'password:test', value: ACTIVE_SCENARIO.answer }, '*');
    } catch (_) {
      /* ignore cross-frame errors */
    }
  }

  function fail() {
    setFeedback('Not quite. Try another guess or reveal another clue.');
    points?.spend(WRONG_COST, 'Password incorrect guess');
  }

  // ---------------- Wiring ----------------
  document.addEventListener('DOMContentLoaded', () => {
    renderClues(shown);

    nextClueBtn?.addEventListener('click', revealNextClue);
    resetCluesBtn?.addEventListener('click', resetClues);

    bonusHintBtn?.addEventListener('click', () => {
      if (bonusHintUsed) {
        setFeedback('Bonus hint already revealed.');
        return;
      }
      const message = ACTIVE_SCENARIO.bonusHint || 'Try mixing letters, numbers, and symbols.';
      points?.spend(BONUS_HINT_COST, 'Password bonus hint');
      if (bonusHintEl) {
        bonusHintEl.textContent = message;
        bonusHintEl.hidden = false;
      }
      bonusHintUsed = true;
      bonusHintBtn.setAttribute('disabled', 'true');
      setFeedback('Bonus hint revealed.');
      updateProgressPercent(70);
    });

    submitBtn?.addEventListener('click', handleSubmit);
    clearBtn?.addEventListener('click', () => {
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

    window.utils?.initStatusHud('password', {
      score: '#passwordPointsTotal',
      delta: '#passwordPointsDelta',
      progressFill: '#passwordProgressFill',
      progressLabel: '#passwordProgressText'
    });
  });

})();
