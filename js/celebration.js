(function () {
  'use strict';

  function hasVaultAccess() {
    try {
      return localStorage.getItem('vault_opened') === '1';
    } catch {
      return false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!hasVaultAccess()) {
      window.location.replace('game.html');
      return;
    }

    const btn = document.querySelector('a[href="endless.html"]');
    if (btn) {
      btn.addEventListener('click', () => {
        try { localStorage.setItem('vault_opened', '1'); } catch (_) { /* ignore */ }
      });
    }
  });
})();
