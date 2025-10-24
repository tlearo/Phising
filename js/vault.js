(function () {
  'use strict';

  const PUZZLES = [
    { key: 'phishing', label: 'Phishing', storage: ['lock_digit_phishing_total'] },
    { key: 'encryption', label: 'Encryption', storage: ['lock_digit_caesar_shift'] },
    { key: 'password', label: 'Password', storage: ['lock_digit_pw_minutes', 'lock_digit_pw_clues'] },
    { key: 'essential', label: 'Essential Eight', storage: ['lock_digit_essential'] },
    { key: 'binary', label: 'Binary', storage: ['lock_digit_binary'] }
  ];

  function readStorageValue(keys) {
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      const num = Number(raw);
      if (!Number.isNaN(num) && Number.isFinite(num)) return num;
      if (/^\d$/.test(raw.trim())) return Number(raw.trim());
    }
    return null;
  }

  function readDigits() {
    const result = {};
    PUZZLES.forEach(item => {
      result[item.key] = readStorageValue(item.storage);
    });
    return result;
  }

  let vaultCompleteAnnounced = false;

  function ensureToastStack() {
    let stack = document.getElementById('toastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toastStack';
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'false');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function showToast(message) {
    if (!message) return;
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 350);
    }, 4300);
  }

  function updateUi() {
    const digits = readDigits();
    const status = document.getElementById('vaultStatus');
    if (!status) return digits;

    const list = status.querySelector('.vault-status__digits');
    const countEl = status.querySelector('.vault-status__count');

    let found = 0;
    PUZZLES.forEach((item, index) => {
      const li = list?.querySelector(`[data-vault-key="${item.key}"]`);
      const digit = digits[item.key];
      const hasDigit = digit != null && digit !== '' && !Number.isNaN(Number(digit));
      if (li) {
        li.textContent = hasDigit ? String(digit) : '•';
        li.classList.toggle('is-found', hasDigit);
        li.setAttribute('aria-label', `${item.label} digit ${hasDigit ? String(digit) : 'locked'}`);
      }
      if (hasDigit) found++;
    });

    if (countEl) {
      countEl.textContent = `${found}/${PUZZLES.length}`;
    }

    const isComplete = found === PUZZLES.length;
    status.classList.toggle('is-complete', isComplete);
    if (isComplete && !vaultCompleteAnnounced) {
      showToast('All digits collected! The vault is ready to unlock.');
      vaultCompleteAnnounced = true;
    } else if (!isComplete) {
      vaultCompleteAnnounced = false;
    }
    return digits;
  }

  function persistDigit(item, digit) {
    if (!item || typeof digit !== 'number' || Number.isNaN(digit)) return;
    if (item.constant != null) return;
    const primary = item.storage[0];
    if (primary) {
      localStorage.setItem(primary, String(digit));
    }
  }

  function unlock(key, digit, options = {}) {
    const item = PUZZLES.find(entry => entry.key === key);
    if (!item) return;
    const numericDigit = Number(digit);
    if (!Number.isNaN(numericDigit)) {
      persistDigit(item, numericDigit);
    }
    const detail = {
      puzzle: key,
      digit: Number.isNaN(numericDigit) ? digit : numericDigit,
      label: item.label
    };
    document.dispatchEvent(new CustomEvent('vault:digit', { detail }));
    updateUi();
    const message = options?.message || `${item.label} digit unlocked: ${detail.digit}.`;
    showToast(message);
  }

  function refresh() {
    return updateUi();
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateUi();
  });

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    const matches = PUZZLES.some(item => item.storage.includes(event.key));
    if (matches) updateUi();
  });

  window.vault = {
    getDigits: readDigits,
    refresh,
    unlock
  };
})();
