(function () {
  'use strict';

  const body = document.body || null;
  const requirement = body?.dataset?.session || 'public';

  const utils = window.utils || {};

  function readUser() {
    if (typeof utils.getUser === 'function') {
      return utils.getUser();
    }
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }

  function ensureLogout() {
    if (typeof window.logout === 'function') return;
    window.logout = function logout() {
      try {
        localStorage.clear();
      } finally {
        window.location.href = 'index.html';
      }
    };
  }

  function attachLogout() {
    ensureLogout();
    document.querySelectorAll('[data-action="logout"]').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        window.logout();
      });
    });
  }

  function toggleVisibility(user) {
    document.querySelectorAll('[data-visible]').forEach(el => {
      const rule = el.dataset.visible;
      let show = true;
      switch (rule) {
        case 'auth':
          show = !!user;
          break;
        case 'guest':
          show = !user;
          break;
        case 'team':
          show = user?.role === 'team';
          break;
        case 'admin':
          show = user?.role === 'admin';
          break;
        case 'logout':
          show = !!user;
          break;
        default:
          show = true;
      }
      if (show) {
        el.removeAttribute('hidden');
        el.removeAttribute('aria-hidden');
      } else {
        el.setAttribute('hidden', 'hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function applyGuard(user) {
    function redirect(target) {
      window.location.href = target;
    }

    if (requirement === 'team' && (!user || user.role !== 'team')) {
      redirect('index.html');
      return false;
    }
    if (requirement === 'admin' && (!user || user.role !== 'admin')) {
      redirect('index.html');
      return false;
    }
    if (requirement === 'auth' && !user) {
      redirect('index.html');
      return false;
    }
    if (requirement === 'guest' && user) {
      redirect(user.role === 'admin' ? 'admin.html' : 'game.html');
      return false;
    }
    return true;
  }

  function markActiveNav() {
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.main-nav a').forEach(link => {
      const href = (link.getAttribute('href') || '').toLowerCase();
      const isActive = href === current;
      if (isActive) {
        link.setAttribute('aria-current', 'page');
        link.classList.add('is-active');
      } else {
        link.removeAttribute('aria-current');
        link.classList.remove('is-active');
      }
    });
  }

  function populateName(user) {
    if (!user?.username) return;
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = user.username.toUpperCase();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const user = readUser();
    if (!applyGuard(user)) return;

    attachLogout();
    toggleVisibility(user);

    if (user?.role === 'admin') {
      document.querySelectorAll('.vault-status').forEach(el => {
        el.setAttribute('hidden', 'hidden');
        el.setAttribute('aria-hidden', 'true');
      });
    }

    markActiveNav();
    populateName(user);

    window.addEventListener('storage', (event) => {
      if (event.key === 'user') {
        toggleVisibility(readUser());
      }
    });
  });
})();
