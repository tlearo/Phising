(function () {
  'use strict';

  const focusableSelectors = [
    'a[href]',
    'area[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const seenKey = (id) => `onboard_seen_${id}`;

  let activeOverlay = null;
  let lastFocus = null;

  function getFocusable(container) {
    return Array.from(container.querySelectorAll(focusableSelectors)).filter((el) => {
      return el.offsetParent !== null && !el.hasAttribute('aria-hidden');
    });
  }

  function openOverlay(overlay, trigger) {
    if (!overlay || overlay.classList.contains('is-open')) return;
    const key = overlay.dataset.onboardKey;
    if (key) {
      try { localStorage.setItem(seenKey(key), '1'); } catch (_) {}
    }

    lastFocus = trigger || document.activeElement;
    activeOverlay = overlay;

    overlay.classList.add('is-open');
    overlay.removeAttribute('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    const focusTarget = overlay.querySelector('[data-onboard-focus]') || getFocusable(overlay)[0] || overlay;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function closeOverlay(overlay) {
    if (!overlay || !overlay.classList.contains('is-open')) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('hidden', 'hidden');
    overlay.setAttribute('aria-hidden', 'true');
    if (overlay === activeOverlay) {
      activeOverlay = null;
    }
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  function handleDocumentKeydown(event) {
    if (!activeOverlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlay(activeOverlay);
      return;
    }
    if (event.key === 'Tab') {
      const focusables = getFocusable(activeOverlay);
      if (!focusables.length) {
        event.preventDefault();
        activeOverlay.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  document.addEventListener('keydown', handleDocumentKeydown);

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.onboard-trigger');
    if (trigger) {
      const targetId = trigger.dataset.onboard;
      const overlay = document.getElementById(targetId);
      if (overlay) {
        event.preventDefault();
        openOverlay(overlay, trigger);
      }
      return;
    }

    const closeBtn = event.target.closest('[data-onboard-close]');
    if (closeBtn) {
      const overlay = closeBtn.closest('.onboard');
      closeOverlay(overlay);
      event.preventDefault();
      return;
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.onboard').forEach((overlay) => {
      overlay.setAttribute('aria-hidden', overlay.hasAttribute('hidden') ? 'true' : 'false');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('tabindex', '-1');

      const key = overlay.dataset.onboardKey;
      const auto = overlay.dataset.onboardAuto === 'true';
      if (auto && key && !localStorage.getItem(seenKey(key))) {
        openOverlay(overlay);
      }
    });
  });

  window.onboard = {
    open: (id) => openOverlay(document.getElementById(id)),
    close: (id) => closeOverlay(document.getElementById(id))
  };
})();
