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
    return getJSON(progressKey(u), { phishing: false, password: false, encryption: false, essential: false });
  }
  function setProgressFlag(flag, value = true, u = getUser()) {
    const key = progressKey(u);
    const p = getJSON(key, {});
    p[flag] = !!value;
    setJSON(key, p);
    return p;
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

  // ---------- Public API ---------------------------------------------------
  window.utils = {
    $, $$, on, createEl, addClass, removeClass, toggleClass,
    getJSON, setJSON, removeJSON,
    getUser, saveUser, progressKey, timesKey, readProgress, setProgressFlag, pushTime,
    fmtSecs, debounce, throttle, fetchJSON, sha256Hex, getQueryParam, announce, safeFocus
  };
})();
