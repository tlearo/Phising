/* utils.js — shared helpers for Cyber Escape Rooms
   - DOM: $, $$, on, createEl, class helpers
   - Storage: getJSON/setJSON/removeJSON
   - User/progress utilities
   - Time/formatting helpers
   - debounce/throttle
   - fetchJSON with timeout (Netlify Functions friendly)
   - crypto: sha256Hex
   - querystring: getQueryParam
*/

(function () {
  'use strict';

  // ---------- DOM helpers --------------------------------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function on(el, type, handler, opts) {
    el?.addEventListener(type, handler, opts || false);
    return () => el?.removeEventListener(type, handler, opts || false);
  }

  function createEl(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('data-')) el.setAttribute(k, v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  const addClass    = (el, c) => el && el.classList.add(c);
  const removeClass = (el, c) => el && el.classList.remove(c);
  const toggleClass = (el, c, force) => el && el.classList.toggle(c, force);

  // ---------- Storage helpers ---------------------------------------------
  function getJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }
  function setJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function removeJSON(key) {
    localStorage.removeItem(key);
  }

  // ---------- User & progress ---------------------------------------------
  function getUser() {
    return getJSON('user', null);
  }
  function saveUser(user) {
    setJSON('user', user);
  }
  function progressKey(u = getUser()) {
    return `${u?.username || 'team'}_progress`;
  }
  function timesKey(u = getUser()) {
    return `${u?.username || 'team'}_times`;
  }
  function readProgress(u = getUser()) {
    return getJSON(progressKey(u), {
      phishing: false,
      password: false,
      encryption: false,
      essential: false,
      binary: false
    });
  }
  function setProgressFlag(flag, value = true, u = getUser()) {
    const key = progressKey(u);
    const p = getJSON(key, {});
    p[flag] = !!value;
    setJSON(key, p);
    return p;
  }
  function progressMetaKey(u = getUser()) {
    return `${u?.username || 'team'}_progress_meta`;
  }
  function readProgressMeta(u = getUser()) {
    return getJSON(progressMetaKey(u), {});
  }
  function setProgressPercent(flag, percent, opts = {}, u = getUser()) {
    const key = progressMetaKey(u);
    const meta = getJSON(key, {});
    const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    meta[flag] = {
      percent: clamped,
      updatedAt: Date.now()
    };
    setJSON(key, meta);
    if (typeof opts.complete === 'boolean') {
      setProgressFlag(flag, opts.complete, u);
    }
    try {
      window.dispatchEvent(new CustomEvent('progress:change', {
        detail: {
          flag,
          percent: clamped,
          complete: !!opts.complete,
          user: u?.username || 'team'
        }
      }));
    } catch (_) {
      // ignore dispatch issues
    }
    return meta[flag];
  }
  function getProgressPercent(flag, u = getUser()) {
    const meta = readProgressMeta(u);
    const entry = meta?.[flag];
    return entry && typeof entry.percent === 'number' ? entry.percent : 0;
  }
  function pushTime(seconds, u = getUser()) {
    const key = timesKey(u);
    const arr = getJSON(key, []);
    arr.push(Number(seconds) || 0);
    setJSON(key, arr);
    return arr;
  }

  // ---------- Formatting ---------------------------------------------------
  function fmtSecs(s) {
    if (s == null || !isFinite(s)) return '—';
    const n = Math.round(s);
    if (n < 60) return `${n}s`;
    const m = Math.floor(n / 60), r = n % 60;
    return `${m}m ${r}s`;
  }

  // ---------- Throttle / Debounce -----------------------------------------
  function debounce(fn, ms = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function throttle(fn, ms = 100) {
    let last = 0, timer = null, lastArgs;
    return function (...args) {
      const now = Date.now();
      lastArgs = args;
      if (now - last >= ms) {
        last = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(this, lastArgs);
        }, ms - (now - last));
      }
    };
  }

  // ---------- Fetch (JSON with timeout) -----------------------------------
  async function fetchJSON(url, options = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) throw new Error(typeof data === 'string' ? data : `HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- Crypto (SHA-256 hex) ----------------------------------------
  async function sha256Hex(s) {
    const enc = new TextEncoder().encode(String(s));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Query string -------------------------------------------------
  function getQueryParam(name, fallback = null) {
    try {
      const params = new URLSearchParams(location.search);
      return params.get(name) ?? fallback;
    } catch {
      return fallback;
    }
  }

  // ---------- Misc ---------------------------------------------------------
  function announce(msg) {
    try { window.a11y?.announce?.(msg); } catch {}
  }

  function safeFocus(el) {
    if (!el) return;
    const prev = el.getAttribute('tabindex');
    if (prev == null) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: false });
    if (prev == null) el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
  }

  // ---------- Points / Scoreboard -----------------------------------------
  const SCORE_BASE = 100;
  const SCORE_LOG_LIMIT = 40;

  function scoreKey(u = getUser()) {
    return `${u?.username || 'team'}_score`;
  }

  function scoreLogKey(u = getUser()) {
    return `${u?.username || 'team'}_score_log`;
  }

  function readScore(u = getUser()) {
    const key = scoreKey(u);
    const raw = localStorage.getItem(key);
    if (raw == null || Number.isNaN(Number(raw))) {
      localStorage.setItem(key, String(SCORE_BASE));
      return SCORE_BASE;
    }
    return Math.max(0, Math.floor(Number(raw)));
  }

  function writeScore(value, reason = 'update', u = getUser()) {
    const key = scoreKey(u);
    const clamped = Math.max(0, Math.round(value));
    localStorage.setItem(key, String(clamped));
    appendScoreLog({ delta: 0, reason, at: Date.now(), total: clamped }, u, true);
    dispatchScoreEvent(clamped);
    return clamped;
  }

  function appendScoreLog(entry, u = getUser(), replaceLast = false) {
    const key = scoreLogKey(u);
    let log;
    try {
      log = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      log = [];
    }
    if (replaceLast && log.length) {
      log[log.length - 1] = entry;
    } else {
      log.push(entry);
    }
    if (log.length > SCORE_LOG_LIMIT) {
      log = log.slice(log.length - SCORE_LOG_LIMIT);
    }
    localStorage.setItem(key, JSON.stringify(log));
    return log;
  }

  function adjustScore(delta, reason, u = getUser()) {
    const current = readScore(u);
    if (!delta) {
      appendScoreLog({ delta: 0, reason, at: Date.now(), total: current }, u);
      return current;
    }
    const updated = Math.max(0, Math.round(current + delta));
    localStorage.setItem(scoreKey(u), String(updated));
    appendScoreLog({ delta, reason, at: Date.now(), total: updated }, u);
    dispatchScoreEvent(updated, delta, reason);
    return updated;
  }

  function dispatchScoreEvent(total, delta = 0, reason = 'update') {
    window.dispatchEvent(new CustomEvent('score:change', {
      detail: { total, delta, reason }
    }));
  }

  function readScoreLog(u = getUser()) {
    try {
      return JSON.parse(localStorage.getItem(scoreLogKey(u)) || '[]');
    } catch {
      return [];
    }
  }

  const pointsApi = {
    ensure() {
      return readScore();
    },
    get() {
      return readScore();
    },
    log() {
      return readScoreLog();
    },
    set(value, reason = 'set') {
      return writeScore(value, reason);
    },
    add(amount, reason = 'award') {
      return adjustScore(Math.abs(amount), reason);
    },
    spend(amount, reason = 'spend') {
      const cost = Math.abs(amount);
      return adjustScore(-cost, reason);
    },
    adjust(amount, reason = 'adjust') {
      return adjustScore(amount, reason);
    }
  };

  function initStatusHud(flag, selectors = {}) {
    const scoreEl = document.querySelector(selectors.score || selectors.scoreSelector);
    const deltaEl = document.querySelector(selectors.delta || selectors.deltaSelector);
    const progressFillEl = document.querySelector(selectors.progressFill || selectors.progressFillSelector);
    const progressLabelEl = document.querySelector(selectors.progressLabel || selectors.progressLabelSelector);

    if (scoreEl && typeof scoreEl.textContent !== 'string') return; // basic guard

    const renderScore = (total, delta = 0, reason = '') => {
      if (scoreEl) scoreEl.textContent = String(total ?? 0).padStart(3, '0');
      if (deltaEl) {
        if (!delta) deltaEl.textContent = '';
        else {
          const sign = delta > 0 ? '+' : '−';
          const abs = Math.abs(delta);
          deltaEl.textContent = `${sign}${abs} pts${reason ? ` — ${reason}` : ''}`;
        }
        deltaEl.classList.toggle('positive', delta > 0);
        deltaEl.classList.toggle('negative', delta < 0);
        if (!delta) {
          deltaEl.classList.remove('positive', 'negative');
        }
      }
    };

    const renderProgress = (percent) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)));
      if (progressFillEl) progressFillEl.style.width = `${clamped}%`;
      if (progressLabelEl) progressLabelEl.textContent = clamped >= 100 ? 'Complete' : `${clamped}% complete`;
    };

    if (typeof pointsApi.get === 'function') {
      renderScore(pointsApi.get(), 0);
    }
    renderProgress(getProgressPercent(flag));

    window.addEventListener('score:change', (ev) => {
      const detail = ev?.detail || {};
      renderScore(detail.total, detail.delta, detail.reason);
    });

    window.addEventListener('progress:change', (ev) => {
      const detail = ev?.detail;
      if (!detail || detail.flag !== flag) return;
      renderProgress(detail.percent);
    });
  }

  // ---------- Back link / nav helpers -------------------------------------
  function backOrHome(href = 'index.html') {
    try {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = href;
      }
    } catch {
      window.location.href = href;
    }
  }

  function initBackLinks(root = document) {
    root.querySelectorAll('[data-back]').forEach(link => {
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        const href = link.getAttribute('data-back') || 'index.html';
        backOrHome(href);
      });
    });
  }

  function hideAdminLinksForTeams(root = document) {
    const user = getUser();
    if (user?.role === 'admin') return;
    root.querySelectorAll('[data-role="admin-link"]').forEach(link => {
      link.setAttribute('hidden', 'hidden');
      link.setAttribute('aria-hidden', 'true');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initBackLinks();
    hideAdminLinksForTeams();
  }, { once: true });

  // ---------- Public API ---------------------------------------------------
  window.utils = {
    $, $$, on, createEl, addClass, removeClass, toggleClass,
    getJSON, setJSON, removeJSON,
    getUser, saveUser, progressKey, timesKey, readProgress, setProgressFlag,
    readProgressMeta, setProgressPercent, getProgressPercent, pushTime,
    fmtSecs, debounce, throttle, fetchJSON, sha256Hex, getQueryParam, announce, safeFocus,
    points: pointsApi,
    backOrHome,
    initStatusHud
  };
})();
