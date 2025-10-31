/* game.js — Cyber Escape Rooms (Game Hub + Vault Lock)
   - Renders overall progress and journey
   - Handles the 5-digit vault lock with SHA-256 hash compare
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
  const DEFAULT_VAULT_HASH = '64864c595119d6e2fd8ea57ce6231f5a7fb00310f969d02b309c76208d3ec283';
  const CORRECT_CODE_HASH = window.VAULT_CODE_HASH || DEFAULT_VAULT_HASH;
  if (!window.VAULT_CODE_HASH) {
    window.VAULT_CODE_HASH = DEFAULT_VAULT_HASH;
  }

  // -------------------- DOM helpers ---------------------------------------

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  function readDigit(key) {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') return '';
    return raw;
  }

  function computeLockDigits(){
    const d1 = readDigit('lock_digit_phishing_total');
    const d2 = readDigit('lock_digit_caesar_shift');
    const d3 = readDigit('lock_digit_pw_minutes') || readDigit('lock_digit_pw_clues');
    const d4 = readDigit('lock_digit_essential');
    const d5 = readDigit('lock_digit_binary');
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

  let aliasInput = null;
  let aliasDisplay = null;

  function updateAliasUI(alias) {
    if (aliasInput && aliasInput.value !== alias) {
      aliasInput.value = alias;
    }
    if (aliasDisplay) {
      aliasDisplay.textContent = alias || '—';
    }
  }

  function renderTeamName(){
    const user = readUser();
    const alias = window.utils?.getPlayerAlias?.() || '';
    const el = $('#teamName');
    if (!el) return;
    const baseName = user?.username || 'TEAM';
    const name = alias || baseName;
    el.textContent = name.toUpperCase();
  }

  // -------------------- Progress rendering --------------------------------

  const PUZZLES = ['phishing','password','encryption','essential','binary'];
  const PUZZLE_LABELS = {
    phishing: 'Phishing Spotter',
    password: 'Password Puzzle',
    encryption: 'Encryption',
    essential: 'ASD Essentials',
    binary: 'Binary Lab'
  };
  const PUZZLE_HINTS = {
    phishing: 'Spot phishing clues and earn the first digit.',
    password: 'Crack the weak password to reveal digit two.',
    encryption: 'Dial in the Caesar shift to learn digit three.',
    essential: 'Match the ASD Essential Eight controls for digit four.',
    binary: 'Finish the binary math to capture the final digit.'
  };
  const PUZZLE_PATHS = {
    phishing: 'phishing.html',
    password: 'password.html',
    encryption: 'encryption.html',
    essential: 'essential.html',
    binary: 'binary.html'
  };

  function computeCompleted(p){
    return PUZZLES.reduce((n, key) => n + (p[key] ? 1 : 0), 0);
  }

  function renderProgress(){
    const p = readProgress();
    const meta = typeof window.utils?.readProgressMeta === 'function'
      ? window.utils.readProgressMeta()
      : {};
    const remoteState = window.stateSync?.lastRemote;
    const remoteMeta = remoteState?.progressMeta || {};
    const remoteProgress = remoteState?.progress || {};
    const remoteVault = remoteState?.vault || {};
    const vaultOpenedLocal = (() => {
      try { return localStorage.getItem('vault_opened') === '1'; } catch { return false; }
    })();
    const vaultOpened = vaultOpenedLocal || remoteVault?.opened === true;
    const done = computeCompleted(p);

    const status = $('#progressStatus');
    if (status) status.textContent = `${done}/${PUZZLES.length} puzzles completed`;

    const overallPercent = Math.round((done / PUZZLES.length) * 100);
    const globalFill = $('#missionProgressFill');
    if (globalFill) globalFill.style.width = `${overallPercent}%`;

    const missionMetaEntry = meta?.mission;
    const currentMissionPercent = missionMetaEntry && typeof missionMetaEntry.percent === 'number'
      ? Math.round(missionMetaEntry.percent)
      : null;
    const needsMissionUpdate = currentMissionPercent == null || currentMissionPercent !== overallPercent;
    if (needsMissionUpdate || (done === PUZZLES.length && currentMissionPercent !== 100)) {
      try {
        window.utils?.setProgressPercent?.('mission', overallPercent, { complete: done === PUZZLES.length });
      } catch (_) {
        /* ignore meta sync errors */
      }
    }

    document.querySelectorAll('.mission-tracker__item').forEach(item => {
      item.classList.remove('is-next');
    });

    PUZZLES.forEach(k => {
      const btn = document.querySelector(`[data-puzzle="${k}"]`);
      const entry = meta?.[k];
      const remoteEntry = remoteMeta?.[k];

      const readPercent = (source) => {
        if (!source || typeof source.percent !== 'number') return null;
        return Math.max(0, Math.min(100, Math.round(source.percent)));
      };

      let percent = readPercent(remoteEntry);
      if (percent == null) percent = readPercent(entry);

      const isComplete = Boolean(p?.[k]) || Boolean(remoteProgress?.[k]);
      if (isComplete && (percent == null || percent < 100)) {
        percent = 100;
      }
      if (percent == null) percent = 0;

      if (btn) {
        const fillEl = btn.querySelector('.mission-tracker__fill');
        const progressLabel = btn.querySelector('.mission-tracker__progress');
        if (fillEl) {
          fillEl.style.width = `${percent}%`;
          fillEl.dataset.percent = String(percent);
        }
        const complete = percent >= 100 && isComplete;
        if (progressLabel) {
          progressLabel.textContent = complete ? 'Complete' : `${percent}%`;
        }
        btn.classList.toggle('is-complete', complete);
        btn.dataset.progressPercent = String(percent);
        btn.dataset.progressComplete = complete ? 'true' : 'false';
        const ariaPercent = complete ? 'complete' : `${percent}% complete`;
        btn.setAttribute('aria-label', `${PUZZLE_LABELS[k]} — ${ariaPercent}`);
      }
    });

    const nextPuzzle = PUZZLES.find(k => !p[k]);
    const nextTag = $('#nextPuzzleTag');
    const nextHint = $('#nextPuzzleHint');
    if (nextPuzzle) {
      document.querySelector(`[data-puzzle="${nextPuzzle}"]`)?.classList.add('is-next');
      if (nextTag) {
        nextTag.textContent = PUZZLE_LABELS[nextPuzzle] || nextPuzzle;
        nextTag.classList.remove('is-complete');
      }
      if (nextHint) {
        nextHint.textContent = PUZZLE_HINTS[nextPuzzle] || 'Tackle the next puzzle to keep momentum.';
      }
    } else {
      if (nextTag) {
        nextTag.textContent = 'Vault ready';
        nextTag.classList.add('is-complete');
      }
      if (nextHint) {
        nextHint.textContent = 'All digits secured! Enter the code and open the chest.';
      }
    }

    const startBtn = $('#startChallengesBtn');
    if (startBtn) {
      if (nextPuzzle) {
        const path = PUZZLE_PATHS[nextPuzzle] || 'phishing.html';
        startBtn.href = path;
        startBtn.textContent = `Go to ${PUZZLE_LABELS[nextPuzzle] || nextPuzzle}`;
      } else {
        startBtn.href = '#lockOpenBtn';
        startBtn.textContent = 'Open the vault';
      }
    }

    const bonusEl = $('#bonusCallout');
    if (bonusEl) {
      const showBonus = !nextPuzzle && vaultOpened;
      bonusEl.hidden = !showBonus;
      bonusEl.setAttribute('aria-hidden', showBonus ? 'false' : 'true');
      bonusEl.dataset.active = showBonus ? 'true' : 'false';
      const aliasCard = $('#playerAliasCard');
      if (aliasCard) {
        aliasCard.hidden = !showBonus;
        aliasCard.setAttribute('aria-hidden', showBonus ? 'false' : 'true');
        aliasCard.dataset.active = showBonus ? 'true' : 'false';
      }
    }
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
      setFeedback('Vault unlocked!', true);
      chest?.classList.add('open'); // your CSS animates this
      openBtn?.setAttribute('aria-label', 'Vault open');
      announce('Vault unlocked');
      unlockBtn?.setAttribute('disabled', 'true');
      try {
        localStorage.setItem('vault_opened', '1');
      } catch (_) {
        /* ignore storage issues */
      }
      window.stateSync?.queueSave?.('vault-opened');
      renderProgress();
      setTimeout(() => {
        window.location.href = 'celebration.html';
      }, 1200);
    } else {
      setFeedback('Incorrect code. Keep playing to confirm your digits.');
    }
  }

  // -------------------- Logout glue (fallback) -----------------------------

  function ensureLogout(){
    if (typeof window.logout === 'function') return;
    window.logout = function () {
      if (window.utils?.logout) {
        window.utils.logout('index.html');
      } else {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      }
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

    aliasInput = $('#playerAliasInput');
    aliasDisplay = $('#playerAliasDisplay');
    const storedAlias = window.utils?.getPlayerAlias?.() || '';
    window.utils?.setPlayerAlias?.(storedAlias);
    updateAliasUI(storedAlias);

    ensureLogout();
    window.vault?.refresh();
    renderTeamName();
    renderProgress();
    const refreshFromSync = () => {
      renderProgress();
      window.vault?.refresh();
    };
    window.addEventListener('progress:change', refreshFromSync);
    window.addEventListener('state-sync:ready', refreshFromSync);
    window.addEventListener('state-sync:applied', refreshFromSync);
    window.addEventListener('pageshow', refreshFromSync);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshFromSync();
      }
    });
    window.utils?.initStatusHud('mission', {
      score: '#scoreTotal',
      delta: '#missionPointsDelta',
      progressFill: '#missionProgressFill'
    });
    const metaKey = `${user.username || 'team'}_progress_meta`;
    const pKey = progressKey(user);
    window.addEventListener('storage', (ev) => {
      if (!ev.key) return;
      if (ev.key === pKey || ev.key === metaKey) {
        renderProgress();
      }
      if (ev.key === 'player_alias') {
        const refreshedAlias = window.utils?.getPlayerAlias?.() || '';
        updateAliasUI(refreshedAlias);
        renderTeamName();
      }
    });
    const how = document.getElementById('lockHow');
    if (how){
      const [a,b,c,d,e] = computeLockDigits().map(v => v || '?');
      how.textContent = `Hint: digits → (1) phishing count = ${a} • (2) shift = ${b} • (3) minutes to crack ≈ ${c} • (4) ASD Essential Eight controls = ${d} • (5) binary product ones digit = ${e}`;
    }

    autoAdvanceWire();
    initScoreboard();

    if (aliasInput) {
      const syncAlias = (value) => {
        const sanitized = window.utils?.setPlayerAlias?.(value) ?? '';
        updateAliasUI(sanitized);
        renderTeamName();
      };
      aliasInput.addEventListener('input', (ev) => {
        syncAlias(ev.target.value);
      });
      aliasInput.addEventListener('blur', (ev) => {
        syncAlias(ev.target.value);
      });
    }

    unlockBtn?.addEventListener('click', tryUnlock);

    // Optional: allow pressing Enter in last digit to attempt unlock
    const lastDigit = digits[digits.length - 1];
    lastDigit?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
    });
  });

})();
