/* accessibility.js
   Lightweight a11y helpers for Cyber Escape Rooms
   - Skip-link focus to #main
   - Mark current page link in header
   - Announce messages to screen readers (aria-live)
   - Smarter keyboard behavior (Esc to clear transient focus, Back shortcut)
   - Buttons-as-toggle support (e.g., phishing brush/eraser)
   - Range inputs announce value; progressbars mirror their value into text
*/

(function () {
  'use strict';

  // --- Utilities -----------------------------------------------------------

  // Ensure there is a polite aria-live region we can use anywhere.
  function ensureLiveRegion() {
    let lr = document.getElementById('a11y-live');
    if (!lr) {
      lr = document.createElement('div');
      lr.id = 'a11y-live';
      lr.setAttribute('aria-live', 'polite');
      lr.setAttribute('aria-atomic', 'true');
      lr.style.position = 'fixed';
      lr.style.left = '-9999px';
      lr.style.top = 'auto';
      lr.style.width = '1px';
      lr.style.height = '1px';
      lr.style.overflow = 'hidden';
      document.body.appendChild(lr);
    }
    return lr;
  }

  // Public announce() helper
  function announce(msg) {
    const lr = ensureLiveRegion();
    // Clear first so screen readers always re-announce
    lr.textContent = '';
    // Small async ensures DOM update sequence
    setTimeout(() => { lr.textContent = msg; }, 0);
  }

  // Get file name of current path (e.g., "/game.html" -> "game.html")
  function currentFile() {
    const p = window.location.pathname;
    const last = p.substring(p.lastIndexOf('/') + 1) || 'index.html';
    return last.toLowerCase();
  }

  // --- Skip link & main focus ---------------------------------------------

  function initSkipLink() {
    const skip = document.querySelector('.skip-link[href^="#"]');
    if (!skip) return;

    skip.addEventListener('click', (e) => {
      const id = skip.getAttribute('href').slice(1);
      const main = document.getElementById(id);
      if (main) {
        e.preventDefault();
        // Ensure main is focusable, then focus
        const prevTabIndex = main.getAttribute('tabindex');
        if (!prevTabIndex) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: false });
        // Restore tabindex if we added it
        if (!prevTabIndex) {
          main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
        }
      }
    });
  }

  // --- Header: mark current page link -------------------------------------

  function markCurrentNav() {
    const file = currentFile();
    const navLinks = document.querySelectorAll('.main-nav .nav-link[href]');
    navLinks.forEach((a) => {
      // Normalize both sides
      const href = a.getAttribute('href');
      if (!href || href.startsWith('javascript:')) return;
      const hrefFile = href.split('?')[0].split('#')[0].toLowerCase() || 'index.html';
      if (hrefFile === file || (file === '' && hrefFile === 'index.html')) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  // --- Keyboard niceties ---------------------------------------------------

  function initKeyShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Alt+ArrowLeft -> Back (matches browser UI but ensures focus stays sensible)
      if ((e.altKey || e.metaKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        history.back();
      }
      // Esc clears transient focus (e.g., buttons) to reduce focus traps
      if (e.key === 'Escape') {
        const main = document.getElementById('main') || document.body;
        main.focus({ preventScroll: true });
        announce('Focus cleared');
      }
    });
  }

  // --- Toggle buttons (e.g., Brush/Eraser) --------------------------------

  function initToggleButtons() {
    // Any button with data-tool inside a toolbox becomes a toggle group
    const groups = new Map();
    document.querySelectorAll('[data-tool]').forEach((btn) => {
      const groupEl = btn.closest('.toolbox, .card, .tools, aside, .main-layout') || document;
      const key = groupEl;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(btn);
    });

    groups.forEach((buttons) => {
      buttons.forEach((btn) => {
        // initialize pressed state by class presence
        const pressed = btn.classList.contains('active') || btn.classList.contains('primary');
        btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        btn.addEventListener('click', () => {
          // exclusive toggle within group
          buttons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          announce(`${btn.textContent.trim()} selected`);
        });
        btn.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            btn.click();
          }
        });
      });
    });
  }

  // --- Range inputs announce their value ----------------------------------

  function initRangeAnnounce() {
    const ranges = document.querySelectorAll('input[type="range"]');
    ranges.forEach((r) => {
      const update = () => {
        r.setAttribute('aria-valuemin', r.min ?? '0');
        r.setAttribute('aria-valuemax', r.max ?? '100');
        r.setAttribute('aria-valuenow', r.value);
      };
      update();
      r.addEventListener('input', update);
      r.addEventListener('change', () => announce(`${r.getAttribute('aria-label') || 'Value'} ${r.value}`));
    });
  }

  // --- Mirror progressbar value into text if a sibling text node exists ----

  function initProgressMirrors() {
    // Look for .progress-bar with inner #progressFill (your layout)
    const bars = document.querySelectorAll('.progress-bar');
    bars.forEach((bar) => {
      const fill = bar.querySelector('#progressFill, .progress-fill');
      const status = document.getElementById('progressStatus') || bar.nextElementSibling;
      if (!fill) return;

      const observer = new MutationObserver(() => {
        const style = getComputedStyle(fill);
        const width = style.width;
        // If we know min/max/now, announce the numeric progress too
        const now = bar.getAttribute('aria-valuenow');
        const max = bar.getAttribute('aria-valuemax') || '100';
        if (status && now) {
          // If status already holds "x/4 puzzles completed", leave it.
          // Otherwise, set a generic percentage.
          if (!/\d+\/\d+/.test(status.textContent)) {
            const pct = Math.round((Number(now) / Number(max)) * 100);
            status.textContent = `Progress ${pct}%`;
          }
        }
      });
      observer.observe(fill, { attributes: true, attributeFilter: ['style', 'class'] });
    });
  }

  // --- Focus ring visibility for mouse vs keyboard users -------------------

  function initFocusVisibleLite() {
    // Add a class on keyboard usage so CSS can show clearer focus outlines
    let usingKeyboard = false;
    function setKb(val) {
      if (usingKeyboard === val) return;
      usingKeyboard = val;
      document.documentElement.classList.toggle('using-keyboard', usingKeyboard);
    }
    document.addEventListener('keydown', (e) => {
      const keys = ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'];
      if (keys.includes(e.key)) setKb(true);
    });
    document.addEventListener('mousedown', () => setKb(false));
    document.addEventListener('touchstart', () => setKb(false), { passive: true });
  }

  // --- Expose a minimal API on window for app scripts ----------------------

  window.a11y = {
    announce
  };

  // --- Init on DOM ready ---------------------------------------------------

  document.addEventListener('DOMContentLoaded', () => {
    ensureLiveRegion();
    initSkipLink();
    markCurrentNav();
    initKeyShortcuts();
    initToggleButtons();
    initRangeAnnounce();
    initProgressMirrors();
    initFocusVisibleLite();
  });

})();
