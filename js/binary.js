(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);

  const BINARY_A = '1101';
  const BINARY_B = '1011';

  const DEC_A = parseInt(BINARY_A, 2);
  const DEC_B = parseInt(BINARY_B, 2);

  const XOR_BIN = xorStrings(BINARY_A, BINARY_B);
  const XOR_DEC = parseInt(XOR_BIN, 2);
  const PRODUCT_DEC = DEC_A * DEC_B;
  const PRODUCT_BIN = PRODUCT_DEC.toString(2);
  const LOCK_DIGIT = PRODUCT_DEC % 10;

  const inputs = {
    xorBin: $('#xorBin'),
    xorDec: $('#xorDec'),
    productBin: $('#productBin'),
    productDec: $('#productDec')
  };

  const status = {
    xor: $('#xorStatus'),
    product: $('#productStatus')
  };

  const feedbackEl = $('#binaryFeedback');
  const chestHint = $('#binaryChestHint');

  const progress = {
    xor: false,
    product: false
  };

  function xorStrings(a, b) {
    const len = Math.max(a.length, b.length);
    const padA = a.padStart(len, '0');
    const padB = b.padStart(len, '0');
    let out = '';
    for (let i = 0; i < len; i += 1) {
      out += padA[i] === padB[i] ? '0' : '1';
    }
    return out;
  }

  function normalizeBinaryInput(value) {
    return (value || '').toString().replace(/[^01]/g, '');
  }

  function parseBinary(value) {
    if (!value || /[^01]/.test(value)) return NaN;
    return parseInt(value, 2);
  }

  function setStatus(key, ok, message) {
    const pill = status[key];
    if (!pill) return;
    pill.textContent = message;
    pill.classList.toggle('ok', !!ok);
    pill.classList.toggle('warn', ok === false);
    pill.classList.toggle('pending', ok == null);
  }

  function setFeedback(msg, ok = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || '';
    feedbackEl.classList.toggle('ok', !!ok);
    feedbackEl.classList.toggle('warn', !ok && !!msg);
  }

  function updateProgressState() {
    const setter = window.utils?.setProgressPercent;
    if (typeof setter !== 'function') return;
    const percent = progress.product ? 100 : (progress.xor ? 60 : 0);
    setter('binary', percent, { complete: progress.product });
  }

  function resetProgress() {
    progress.xor = false;
    progress.product = false;
    updateProgressState();
  }

  function populateDefaults() {
    $('#binaryA')?.replaceChildren(document.createTextNode(BINARY_A));
    $('#binaryB')?.replaceChildren(document.createTextNode(BINARY_B));
    $('#decimalA')?.replaceChildren(document.createTextNode(String(DEC_A)));
    $('#decimalB')?.replaceChildren(document.createTextNode(String(DEC_B)));
  }

  function clearInputs() {
    Object.values(inputs).forEach(input => {
      if (input) input.value = '';
    });
    setStatus('xor', null, 'Pending');
    setStatus('product', null, 'Pending');
    setFeedback('');
    chestHint?.setAttribute('hidden', 'hidden');
    resetProgress();
  }

  function checkXor() {
    const binInput = normalizeBinaryInput(inputs.xorBin?.value || '');
    const decInput = Number(inputs.xorDec?.value || NaN);

    if (!binInput) {
      setStatus('xor', false, 'Enter XOR in binary.');
      progress.xor = false;
      return false;
    }
    if (parseBinary(binInput) !== XOR_DEC || binInput.length !== XOR_BIN.length) {
      setStatus('xor', false, 'Binary XOR is incorrect.');
      progress.xor = false;
      return false;
    }
    if (!Number.isInteger(decInput) || decInput !== XOR_DEC) {
      setStatus('xor', false, 'Decimal XOR is incorrect.');
      progress.xor = false;
      return false;
    }
    setStatus('xor', true, 'Great! XOR solved.');
    progress.xor = true;
    return true;
  }

  function checkProduct() {
    const binInput = normalizeBinaryInput(inputs.productBin?.value || '');
    const decInput = Number(inputs.productDec?.value || NaN);

    if (!binInput) {
      setStatus('product', false, 'Enter product in binary.');
      progress.product = false;
      return false;
    }

    if (parseBinary(binInput) !== PRODUCT_DEC || binInput.length !== PRODUCT_BIN.length) {
      setStatus('product', false, 'Binary product is incorrect.');
      progress.product = false;
      return false;
    }

    if (!Number.isInteger(decInput) || decInput !== PRODUCT_DEC) {
      setStatus('product', false, 'Decimal product is incorrect.');
      progress.product = false;
      return false;
    }

    setStatus('product', true, 'Excellent! Product confirmed.');
    progress.product = true;
    return true;
  }

  function storeLockDigit() {
    try {
      localStorage.setItem('lock_digit_binary', String(LOCK_DIGIT));
    } catch (_) {
      /* ignore */
    }
  }

  function markBinaryComplete() {
    const setter = window.utils?.setProgressPercent;
    setter?.('binary', 100, { complete: true });
    const flag = window.utils?.setProgressFlag;
    flag?.('binary', true);
    storeLockDigit();
  }

  function handleCheck() {
    const xorOk = checkXor();
    const productOk = checkProduct();
    updateProgressState();

    if (xorOk && productOk) {
      setFeedback(`✅ Nailed it! Decimal product is ${PRODUCT_DEC}. Vault digit captured: ${LOCK_DIGIT}.`, true);
      chestHint?.removeAttribute('hidden');
      markBinaryComplete();
    } else if (xorOk || productOk) {
      setFeedback('Almost there—double-check the remaining row.', false);
      chestHint?.setAttribute('hidden', 'hidden');
    } else {
      setFeedback('Not yet. Review your XOR logic and binary multiplication.', false);
      chestHint?.setAttribute('hidden', 'hidden');
    }
  }

  function initEvents() {
    $('#binaryCheck')?.addEventListener('click', handleCheck);
    $('#binaryReset')?.addEventListener('click', clearInputs);

    Object.values(inputs).forEach(input => {
      input?.addEventListener('input', () => {
        if (!input.value) {
          setFeedback('');
        }
      });
      input?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          handleCheck();
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    populateDefaults();
    clearInputs();
    initEvents();
  });
})();
