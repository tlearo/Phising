/* auth.js — Cyber Escape Rooms
   - Login via Netlify Function (Neon-backed) with graceful demo fallback
   - Saves { username, role } in localStorage as "user"
   - Redirects admin -> admin.html, teams -> game.html
   - Global logout()
*/

(function () {
  'use strict';

  // ---------- Config -------------------------------------------------------

  // Netlify Function endpoint (same origin, CSP-friendly)
  const LOGIN_ENDPOINT = '/.netlify/functions/login';

  // Demo accounts (fallback if server is offline / not configured yet)
  const DEMO_USERS = {
    admin: { password: 'r8z-Je0_H9fcbJDm', role: 'admin' },
    team1: { password: 'fsz1XVheyP_00xWh', role: 'team' },
    team2: { password: '15oYWcU2d9mooynH', role: 'team' },
    team3: { password: 'lGU6W0NkikzDr2Dp', role: 'team' },
    team4: { password: 'hVD3hVew2bbDtFHs', role: 'team' },
    team5: { password: 'I7Ev1VSZRFICIatx', role: 'team' },
    trojan_horsin: { password: 'Cslvq90kRfLLdzg7', role: 'team' },
    blackhoodies: { password: '2UbFZ1oYWkAEBJUl', role: 'team' },
    cipherettes: { password: 'CmLdyP85YmPQd3JF', role: 'team' },
    peas: { password: 'V55EVxp_2cR2Q99L', role: 'team' },
    sats: { password: '8sCBNg0o1xUs2Tp0', role: 'team' },
    darkwebaliens: { password: 'QkrjPdhm6UHKwgI0', role: 'team' },
    crossguild: { password: 'ss_Qs8SWXdetYZjV', role: 'team' },
    hobarthackers: { password: 'n04dnUOAT-SGIgVQ', role: 'team' },
    specs: { password: 'YBKCrtgvuAP-U6', role: 'team' },
    gatecrashers: { password: 'kLfkvAvU1AerPi4H', role: 'team' },
    rootkitrebels: { password: 'RkReb3ls!92', role: 'team' }
  };

  // ---------- DOM helpers --------------------------------------------------

  const $ = (sel, root = document) => root.querySelector(sel);

  function setError(msg) {
    const el = $('#errorMsg');
    if (el) { el.textContent = msg || ''; }
    if (window.a11y && msg) window.a11y.announce(msg);
  }

  function setLoading(isLoading) {
    const btn = $('#loginForm button[type="submit"]');
    if (!btn) return;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? 'Logging in…' : 'Login';
  }

  function redirectForRole(role) {
    if (role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'game.html';
    }
  }

  // ---------- Storage ------------------------------------------------------

  function saveUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  function readUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }

  // ---------- Server login (Neon via Netlify Function) ---------------------

  async function tryServerLogin(username, password) {
    // Returns { ok: boolean, user?: {username, role}, error?: string }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000); // 8s timeout
      const res = await fetch(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: ctrl.signal
      });
      clearTimeout(t);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `Server error ${res.status}${text ? `: ${text}` : ''}` };
      }

      const data = await res.json();
      // Expected shape: { ok: true, user: { username, role } }
      if (data && data.ok && data.user && data.user.username && data.user.role) {
        return { ok: true, user: { username: data.user.username, role: data.user.role } };
      }
      return { ok: false, error: 'Unexpected server response' };
    } catch (e) {
      return { ok: false, error: e.name === 'AbortError' ? 'Login timed out' : (e.message || 'Network error') };
    }
  }

  // ---------- Demo fallback ------------------------------------------------

  function tryDemoLogin(username, password) {
    const entry = DEMO_USERS[username?.toLowerCase?.()];
    if (entry && password === entry.password) {
      return { ok: true, user: { username, role: entry.role } };
    }
    return { ok: false, error: 'Invalid credentials' };
  }

  // ---------- Public logout (used by headers) ------------------------------

  window.logout = function logout() {
    if (window.utils?.logout) {
      window.utils.logout('index.html');
    } else {
      localStorage.removeItem('user');
      window.location.href = 'index.html';
    }
  };

  const DEFAULT_PROGRESS = {
    phishing: false,
    password: false,
    encryption: false,
    essential: false,
    binary: false
  };

  async function bootstrapTeamState(username) {
    const team = String(username || '').toLowerCase();
    if (!team) return;
    try {
      const url = new URL('/.netlify/functions/team-state', window.location.origin);
      url.searchParams.set('team', team);
      const res = await fetch(url.toString(), { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const state = payload?.state;
      if (!state) return;
      const progressKey = `${team}_progress`;
      const metaKey = `${team}_progress_meta`;
      const timesKey = `${team}_times`;
      const scoreKey = `${team}_score`;
      const scoreLogKey = `${team}_score_log`;
      const activityKey = `${team}_activity`;
      localStorage.setItem(progressKey, JSON.stringify({ ...DEFAULT_PROGRESS, ...(state.progress || {}) }));
      localStorage.setItem(metaKey, JSON.stringify(state.progressMeta || {}));
      localStorage.setItem(timesKey, JSON.stringify(state.times || []));
      if (Number.isFinite(state.score)) {
        localStorage.setItem(scoreKey, String(Math.max(0, Math.round(state.score))));
      }
      localStorage.setItem(scoreLogKey, JSON.stringify(state.scoreLog || []));
      localStorage.setItem(activityKey, JSON.stringify(state.activity || []));
      if (state.vault) {
        if (state.vault.phishing) localStorage.setItem('lock_digit_phishing_total', String(state.vault.phishing));
        if (state.vault.encryption) localStorage.setItem('lock_digit_caesar_shift', String(state.vault.encryption));
        if (state.vault.password) localStorage.setItem('lock_digit_pw_minutes', String(state.vault.password));
        if (state.vault.essential) localStorage.setItem('lock_digit_essential', String(state.vault.essential));
        if (state.vault.binary) localStorage.setItem('lock_digit_binary', String(state.vault.binary));
        localStorage.setItem(`${team}_vault`, JSON.stringify(state.vault));
      }
    } catch (err) {
      console.warn('Unable to hydrate team state', err);
    }
  }

  // ---------- Page bootstrap ----------------------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    const user = readUser();

    // If we land on the login page while already logged in, bounce to destination.
    // (Keeps deep links tidy; still allows manual logout from header.)
    if (document.body && $('form#loginForm')) {
      if (user && user.role) {
        redirectForRole(user.role);
        return;
      }
    }

    const form = $('#loginForm');
    if (!form) return; // not on index.html

    const usernameEl = $('#username');
    const passwordEl = $('#password');

    // Helpful defaults (optional)
    if (!usernameEl.value) usernameEl.value = 'team1';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const username = (usernameEl.value || '').trim();
      const password = passwordEl.value || '';

      if (!username || !password) {
        setLoading(false);
        return setError('Please enter a username and password.');
      }

      // 1) Try server (Netlify Function / Neon)
      const server = await tryServerLogin(username, password);
      if (server.ok) {
        saveUser(server.user);
        if (server.user.role === 'team') {
          await bootstrapTeamState(server.user.username);
          try {
            window.utils?.pushActivity({ type: 'session', status: 'login', detail: 'Signed in' });
            window.stateSync?.saveNow?.('login');
          } catch (_) {
            /* ignore */
          }
        }
        setLoading(false);
        if (window.a11y) window.a11y.announce('Login successful');
        return redirectForRole(server.user.role);
      }

      // 2) Fallback to demo users
      const demo = tryDemoLogin(username, password);
      if (demo.ok) {
        saveUser(demo.user);
        if (demo.user.role === 'team') {
          try {
            window.utils?.pushActivity({ type: 'session', status: 'login', detail: 'Signed in (demo)' });
            window.stateSync?.saveNow?.('login');
          } catch (_) {
            /* ignore */
          }
        }
        setLoading(false);
        if (window.a11y) window.a11y.announce('Logged in with demo account');
        return redirectForRole(demo.user.role);
      }

      // 3) Fail
      setLoading(false);
      setError('Login failed. ' + (server.error || 'Check your username and password.'));
    });

    // Clear button feedback
    $('#clearBtn')?.addEventListener('click', () => {
      setError('');
      if (usernameEl) usernameEl.focus();
    });
  });
})();
