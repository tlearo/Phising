(function () {
  'use strict';

  const utils = window.utils;
  if (!utils || typeof utils.getUser !== 'function') return;

  const user = utils.getUser();
  if (!user || user.role !== 'team') return;

  const TEAM = String(user.username || '').toLowerCase();
  if (!TEAM) return;

  const ENDPOINT = '/.netlify/functions/team-state';
  const AUTO_PULL_MS = 10000;
  const DEFAULT_PROGRESS = {
    phishing: false,
    password: false,
    encryption: false,
    essential: false,
    binary: false
  };
  const STORAGE_KEYS = {
    progress: utils.progressKey(user),
    progressMeta: utils.progressMetaKey ? utils.progressMetaKey(user) : `${TEAM}_progress_meta`,
    times: utils.timesKey(user),
    score: `${TEAM}_score`,
    scoreLog: `${TEAM}_score_log`,
    activity: `${TEAM}_activity`
  };
  const TEAM_VAULT_KEY = `${TEAM}_vault`;
  const RESET_VERSION_KEY = `${TEAM}_reset_version`;

  function clearPuzzleState() {
    const globalKeys = [
      'lock_digit_phishing_total',
      'lock_digit_caesar_shift',
      'lock_digit_pw_minutes',
      'lock_digit_pw_clues',
      'lock_digit_essential',
      'lock_digit_binary'
    ];
    globalKeys.forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    const patterns = [
      /^phish_done_/,
      /^class_/,
      new RegExp(`^${TEAM}_phishing_`),
      new RegExp(`^${TEAM}_progress$`),
      new RegExp(`^${TEAM}_progress_meta$`)
    ];
    Object.keys(localStorage).forEach(key => {
      if (patterns.some((regex) => regex.test(key))) {
        try { localStorage.removeItem(key); } catch (_) {}
      }
    });
    try { localStorage.removeItem(TEAM_VAULT_KEY); } catch (_) {}
    try { localStorage.removeItem(RESET_VERSION_KEY); } catch (_) {}
    try { window.vault?.refresh?.(); } catch (_) {}
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function collectVault() {
    const existing = readTeamVault();
    const digits = {
      phishing: localStorage.getItem('lock_digit_phishing_total') || null,
      encryption: localStorage.getItem('lock_digit_caesar_shift') || null,
      password: localStorage.getItem('lock_digit_pw_minutes') || localStorage.getItem('lock_digit_pw_clues') || null,
      essential: localStorage.getItem('lock_digit_essential') || null,
      binary: localStorage.getItem('lock_digit_binary') || null
    };
    const meta = { ...(existing || {}) };
    Object.entries(digits).forEach(([key, value]) => {
      if (value != null) meta[key] = value;
    });
    return meta;
  }

  function readTeamVault() {
    return readJSON(TEAM_VAULT_KEY, {});
  }

  function applyVault(vault = {}) {
    if (vault.phishing) localStorage.setItem('lock_digit_phishing_total', String(vault.phishing));
    if (vault.encryption) localStorage.setItem('lock_digit_caesar_shift', String(vault.encryption));
    if (vault.password) localStorage.setItem('lock_digit_pw_minutes', String(vault.password));
    if (vault.essential) localStorage.setItem('lock_digit_essential', String(vault.essential));
    if (vault.binary) localStorage.setItem('lock_digit_binary', String(vault.binary));
  }

  function captureState() {
    const latestVault = Object.keys(readTeamVault() || {}).length ? readTeamVault() : collectVault();
    if (Object.keys(latestVault).length) {
      writeJSON(TEAM_VAULT_KEY, latestVault);
    }
    return {
      team: TEAM,
      progress: readJSON(STORAGE_KEYS.progress, DEFAULT_PROGRESS),
      progressMeta: readJSON(STORAGE_KEYS.progressMeta, {}),
      times: readJSON(STORAGE_KEYS.times, []),
      score: Number(localStorage.getItem(STORAGE_KEYS.score) || 100),
      scoreLog: readJSON(STORAGE_KEYS.scoreLog, []),
      activity: readJSON(STORAGE_KEYS.activity, []),
      vault: latestVault
    };
  }

  function applyRemoteState(state = {}) {
    const progress = { ...DEFAULT_PROGRESS, ...(state.progress || {}) };
    writeJSON(STORAGE_KEYS.progress, progress);
    if (state.progressMeta) writeJSON(STORAGE_KEYS.progressMeta, state.progressMeta);
    if (Array.isArray(state.times)) writeJSON(STORAGE_KEYS.times, state.times);
    if (Number.isFinite(state.score)) localStorage.setItem(STORAGE_KEYS.score, String(Math.max(0, Math.round(state.score))));
    if (Array.isArray(state.scoreLog)) writeJSON(STORAGE_KEYS.scoreLog, state.scoreLog);
    if (Array.isArray(state.activity)) writeJSON(STORAGE_KEYS.activity, state.activity);
    if (state.vault) {
      writeJSON(TEAM_VAULT_KEY, state.vault);
      applyVault(state.vault);
      const remoteReset = state.vault?.resetVersion;
      const localReset = localStorage.getItem(RESET_VERSION_KEY);
      if (remoteReset && String(remoteReset) !== localReset) {
        clearPuzzleState();
        localStorage.setItem(RESET_VERSION_KEY, String(remoteReset));
        setTimeout(() => window.location.reload(), 120);
      }
    }
  }

  const stateSync = {
    pending: null,
    timer: null,
    inflight: null,
    lastPull: 0,
    lastPush: 0,
    busy: false
  };

  async function pull(initial = false) {
    try {
      const url = new URL(ENDPOINT, window.location.origin);
      url.searchParams.set('team', TEAM);
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.state) {
        applyRemoteState(data.state);
        stateSync.lastPull = Date.now();
        if (initial) {
          window.dispatchEvent(new CustomEvent('state-sync:ready', { detail: { team: TEAM } }));
        }
      }
    } catch (err) {
      console.warn('[state-sync] pull failed', err);
    }
  }

  async function push(reason = 'auto') {
    if (stateSync.busy) {
      stateSync.pending = reason;
      return;
    }
    stateSync.busy = true;
    try {
      const payload = captureState();
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, reason })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      stateSync.lastPush = Date.now();
    } catch (err) {
      console.warn('[state-sync] push failed', err);
    } finally {
      stateSync.busy = false;
      if (stateSync.pending) {
        const pendingReason = stateSync.pending;
        stateSync.pending = null;
        queueSave(pendingReason);
      }
    }
  }

  function queueSave(reason = 'auto') {
    clearTimeout(stateSync.timer);
    stateSync.timer = setTimeout(() => push(reason), 1200);
  }

  function saveNow(reason = 'manual') {
    clearTimeout(stateSync.timer);
    return push(reason);
  }

  window.stateSync = {
    queueSave,
    saveNow,
    refresh: () => pull(false),
    capture: captureState
  };

  window.addEventListener('beforeunload', () => {
    if (stateSync.busy) return;
    saveNow('unload');
  });

  pull(true);
  setInterval(() => {
    pull(false);
  }, AUTO_PULL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      queueSave('visibility');
    } else {
      pull(false);
    }
  });

  window.addEventListener('online', () => {
    pull(false);
    queueSave('online');
  });
})();
