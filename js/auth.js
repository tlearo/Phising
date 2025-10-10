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
    admin: { password: 'admin123', role: 'admin' },
    team1: { password: 'pass1', role: 'team' },
    team2: { password: 'pass2', role: 'team' },
    team3: { password: 'pass3', role: 'team' },
    team4: { password: 'pass4', role: 'team' },
    team5: { password: 'pass5', role: 'team' }
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
    localStorage.clear();
    window.location.href = 'index.html';
  };

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
        setLoading(false);
        if (window.a11y) window.a11y.announce('Login successful');
        return redirectForRole(server.user.role);
      }

      // 2) Fallback to demo users
      const demo = tryDemoLogin(username, password);
      if (demo.ok) {
        saveUser(demo.user);
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
