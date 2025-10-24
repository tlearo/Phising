(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const BINARY_A = '1101';
  const BINARY_B = '1011';
  const DEC_A = parseInt(BINARY_A, 2);
  const DEC_B = parseInt(BINARY_B, 2);
  const XOR_BIN = xorStrings(BINARY_A, BINARY_B);
  const XOR_DEC = parseInt(XOR_BIN, 2);
  const PRODUCT_DEC = DEC_A * DEC_B;
  const PRODUCT_BIN = PRODUCT_DEC.toString(2);

  const BIT_LENGTH = Math.max(BINARY_A.length, BINARY_B.length);
  const POSITIONS = Array.from({ length: BIT_LENGTH }, (_, i) => BIT_LENGTH - 1 - i);
  const PLACE_VALUES = POSITIONS.map(exp => 2 ** exp);

  const inputs = {
    xorDec: $('#xorDec'),
    productBin: $('#productBin'),
    productDec: $('#productDec')
  };

  const status = {
    bits: $('#bitsStatus'),
    xor: $('#xorStatus'),
    product: $('#productStatus')
  };

  const sumLabels = {
    a: $('#binarySumA'),
    b: $('#binarySumB'),
    xor: $('#binarySumXor')
  };

  const bitInputs = {
    a: [],
    b: [],
    xor: []
  };

  const feedbackEl = $('#binaryFeedback');
  const chestHint = $('#binaryChestHint');
  const hintBtn = $('#binaryHintBtn');
  const hintBox = $('#binaryHintText');
  const vaultDigitDisplay = $('#binaryVaultDigit');
  const placeTable = $('#binaryPlaceTable');

  const points = window.utils?.points;
  points?.ensure();

  let hintUsed = false;

  const progress = {
    bits: false,
    xor: false,
    product: false
  };

  if (vaultDigitDisplay) {
    const stored = localStorage.getItem('lock_digit_binary');
    vaultDigitDisplay.textContent = stored ? stored : '—';
  }

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

  function sanitizeBitInput(el) {
    if (!el) return;
    const clean = el.value.replace(/[^01]/g, '');
    el.value = clean.slice(-1);
  }

  function readBits(row) {
    return bitInputs[row].map(input => (input.value || '').trim()).join('');
  }

  function setStatus(key, state, message) {
    const pill = status[key];
    if (!pill) return;
    pill.classList.remove('ok', 'warn', 'pending');
    if (state === true) pill.classList.add('ok');
    else if (state === false) pill.classList.add('warn');
    else pill.classList.add('pending');

    let text = message;
    if (!text) {
      text = state === true ? 'Complete' : state === false ? 'Check again' : 'Pending';
    }
    pill.textContent = text;
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
    let percent = 0;
    if (progress.bits) percent = 40;
    if (progress.bits && progress.xor) percent = 70;
    if (progress.product) percent = 100;
    setter('binary', percent, { complete: progress.product });
  }

  function resetProgress() {
    progress.bits = false;
    progress.xor = false;
    progress.product = false;
    updateProgressState();
  }

  function populateDefaults() {
    $('#binaryA')?.replaceChildren(document.createTextNode(BINARY_A.padStart(BIT_LENGTH, '0')));
    $('#binaryB')?.replaceChildren(document.createTextNode(BINARY_B.padStart(BIT_LENGTH, '0')));
  }

  function clearInputs() {
    ['a', 'b', 'xor'].forEach(row => {
      bitInputs[row].forEach(input => { input.value = ''; });
    });
    Object.values(inputs).forEach(input => { if (input) input.value = ''; });
    setStatus('bits', true, 'Binary rows provided.');
    setStatus('xor', null, 'Pending');
    setStatus('product', null, 'Pending');
    setFeedback('');
    chestHint?.setAttribute('hidden', 'hidden');
    hintBox?.setAttribute('hidden', 'hidden');
    hintUsed = false;
    progress.bits = true;
    progress.xor = false;
    progress.product = false;
    updateProgressState();
    updateSums();
  }

  function describeBits(bits) {
    if (!bits || bits.length !== BIT_LENGTH) return 'Enter 0s and 1s above each column.';
    if (/[^01]/.test(bits)) return 'Use only 0 or 1 in every slot.';
    const contributions = [];
    let total = 0;
    bits.split('').forEach((bit, idx) => {
      if (bit === '1') {
        const value = PLACE_VALUES[idx];
        contributions.push(value);
        total += value;
      }
    });
    if (!contributions.length) return 'All zeros so far.';
    return `${contributions.join(' + ')} = ${total}`;
  }

  function updateSums() {
    const aBits = BINARY_A.padStart(BIT_LENGTH, '0');
    const bBits = BINARY_B.padStart(BIT_LENGTH, '0');
    if (sumLabels.a) {
      sumLabels.a.textContent = `Binary A contributions: ${describeBits(aBits)} (decimal ${DEC_A})`;
    }
    if (sumLabels.b) {
      sumLabels.b.textContent = `Binary B contributions: ${describeBits(bBits)} (decimal ${DEC_B})`;
    }
    if (sumLabels.xor) {
      const xorBits = readBits('xor');
      if (xorBits && xorBits.length === BIT_LENGTH && !/[^01]/.test(xorBits)) {
        const total = parseInt(xorBits, 2);
        sumLabels.xor.textContent = `XOR contributions: ${describeBits(xorBits)} (decimal ${total})`;
      } else {
        sumLabels.xor.textContent = 'XOR contributions: Enter 0/1 values for each column.';
      }
    }
  }

  function validateBitsRow(row, expected, label) {
    const bits = readBits(row);
    if (bits.length !== BIT_LENGTH) {
      return { ok: false, reason: `Fill every column for ${label}.` };
    }
    if (/[^01]/.test(bits)) {
      return { ok: false, reason: `${label} must use only 0 or 1.` };
    }
    if (bits !== expected) {
      return { ok: false, reason: `${label} should equal ${expected} (decimal ${row === 'a' ? DEC_A : DEC_B}).` };
    }
    return { ok: true };
  }

  function validateBits() {
    setStatus('bits', true, 'Binary rows provided.');
    progress.bits = true;
    return true;
  }

  function checkXor(bitsOk) {
    if (!bitsOk) {
      setStatus('xor', false, 'Complete Binary A and B first.');
      progress.xor = false;
      return false;
    }

    const xorBits = readBits('xor');
    if (xorBits.length !== BIT_LENGTH) {
      setStatus('xor', false, 'Fill the XOR row with 0s and 1s.');
      progress.xor = false;
      return false;
    }
    if (/[^01]/.test(xorBits)) {
      setStatus('xor', false, 'Use only 0 or 1 in the XOR row.');
      progress.xor = false;
      return false;
    }
    if (xorBits !== XOR_BIN) {
      setStatus('xor', false, 'Revisit the XOR bits (remember: 1 ⊕ 1 = 0, 1 ⊕ 0 = 1).');
      progress.xor = false;
      return false;
    }

    const decInput = Number(inputs.xorDec?.value || NaN);
    if (!Number.isInteger(decInput) || decInput !== XOR_DEC) {
      setStatus('xor', false, 'Decimal XOR does not match the binary row.');
      progress.xor = false;
      return false;
    }

    setStatus('xor', true, 'XOR confirmed.');
    progress.xor = true;
    return true;
  }

  function checkProduct() {
    const binInput = (inputs.productBin?.value || '').replace(/[^01]/g, '');
    const decInput = Number(inputs.productDec?.value || NaN);

    if (!binInput) {
      setStatus('product', false, 'Enter the product in binary.');
      progress.product = false;
      return false;
    }

    if (parseInt(binInput, 2) !== PRODUCT_DEC || binInput.length !== PRODUCT_BIN.length) {
      setStatus('product', false, 'Binary product is incorrect.');
      progress.product = false;
      return false;
    }

    if (!Number.isInteger(decInput) || decInput !== PRODUCT_DEC) {
      setStatus('product', false, 'Decimal product is incorrect.');
      progress.product = false;
      return false;
    }

    setStatus('product', true, 'Product confirmed.');
    progress.product = true;
    return true;
  }

  function storeLockDigit() {
    try {
      localStorage.setItem('lock_digit_binary', String(XOR_DEC));
    } catch (_) {
      /* ignore */
    }
    if (vaultDigitDisplay) {
      vaultDigitDisplay.textContent = String(XOR_DEC);
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
    const alreadyComplete = window.utils?.readProgress?.()?.binary;
    const bitsOk = validateBits();
    const xorOk = checkXor(bitsOk);
    const productOk = checkProduct();
    updateProgressState();

    if (bitsOk && xorOk && productOk) {
      setFeedback(`Success! Decimal product is ${PRODUCT_DEC}. Vault digit captured: ${XOR_DEC}.`, true);
      chestHint?.removeAttribute('hidden');
      markBinaryComplete();
      if (!alreadyComplete) {
        window.vault?.unlock('binary', XOR_DEC, {
          message: `Binary digit ${XOR_DEC} recorded. Enter it on the vault panel.`
        });
      }
    } else if (bitsOk && xorOk) {
      setFeedback('Almost there—confirm the multiplication to finish.', false);
      chestHint?.setAttribute('hidden', 'hidden');
    } else if (bitsOk) {
      setFeedback('Binary rows look good. Solve the XOR and product next.', false);
      chestHint?.setAttribute('hidden', 'hidden');
    } else {
      setFeedback('Not yet. Double-check the binary rows from the place-value table.', false);
      chestHint?.setAttribute('hidden', 'hidden');
    }
  }

  function renderPlaceTable() {
    if (!placeTable) return;
    placeTable.innerHTML = '';
    const thead = document.createElement('thead');
    const headerRows = [
      { label: 'Position', values: POSITIONS.map(String) },
      { label: 'Exponent', values: POSITIONS.map(exp => `2^${exp}`) },
      { label: 'Value', values: PLACE_VALUES.map(String) }
    ];

    headerRows.forEach(row => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = row.label;
      tr.appendChild(th);
      row.values.forEach(value => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      thead.appendChild(tr);
    });
    placeTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    const rows = [
      { label: 'Binary A', digits: BINARY_A.padStart(BIT_LENGTH, '0') },
      { label: 'Binary B', digits: BINARY_B.padStart(BIT_LENGTH, '0') }
    ];

    rows.forEach(row => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = row.label;
      tr.appendChild(th);
      Array.from(row.digits).forEach((digit, idx) => {
        const td = document.createElement('td');
        td.textContent = digit;
        td.classList.add(digit === '1' ? 'is-on' : 'is-off');
        td.setAttribute('data-position', String(POSITIONS[idx]));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    placeTable.appendChild(tbody);
  }

  function renderInputTable() {
    const table = $('#binaryInputTable');
    if (!table) return;

    table.innerHTML = '';
    const thead = document.createElement('thead');
    const headerRows = [
      { label: 'Position', values: POSITIONS.map(String) },
      { label: 'Exponent', values: POSITIONS.map(exp => `2^${exp}`) },
      { label: 'Value', values: PLACE_VALUES.map(String) }
    ];

    headerRows.forEach(row => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = row.label;
      tr.appendChild(th);
      row.values.forEach(value => {
        const thCol = document.createElement('th');
        thCol.scope = 'col';
        thCol.textContent = value;
        tr.appendChild(thCol);
      });
      thead.appendChild(tr);
    });
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const rows = [
      { key: 'a', label: 'Binary A' },
      { key: 'b', label: 'Binary B' },
      { key: 'xor', label: 'A XOR B' }
    ];

    rows.forEach(row => {
      if (!bitInputs[row.key]) bitInputs[row.key] = [];
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = row.label;
      tr.appendChild(th);
      for (let i = 0; i < BIT_LENGTH; i += 1) {
        const td = document.createElement('td');
        if (row.key === 'xor') {
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'numeric';
          input.autocomplete = 'off';
          input.placeholder = '0';
          input.maxLength = 1;
          input.dataset.row = row.key;
          input.dataset.index = String(i);
          input.addEventListener('input', () => {
            sanitizeBitInput(input);
            progress.xor = false;
            setStatus('xor', null, 'Pending');
            updateSums();
          });
          td.appendChild(input);
          bitInputs[row.key].push(input);
        } else {
          const digits = row.key === 'a' ? BINARY_A.padStart(BIT_LENGTH, '0') : BINARY_B.padStart(BIT_LENGTH, '0');
          const digit = digits[i];
          const span = document.createElement('span');
          span.textContent = digit;
          td.textContent = digit;
          td.classList.add(digit === '1' ? 'is-on' : 'is-off');
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    updateSums();
    setStatus('bits', true, 'Binary rows provided.');
    progress.bits = true;
  }

  function initEvents() {
    $('#binaryCheck')?.addEventListener('click', handleCheck);
    $('#binaryReset')?.addEventListener('click', () => {
      clearInputs();
      setFeedback('');
    });

    hintBtn?.addEventListener('click', () => {
      if (hintUsed) {
        setFeedback('Hint already revealed—align the place values and multiply like long multiplication.', true);
        return;
      }
      hintUsed = true;
      hintBox?.removeAttribute('hidden');
      points?.spend(5, 'Binary hint');
      setFeedback('Hint revealed. Switch on every column where there is a 1, then add the shifted values together.', true);
    });

    Object.values(inputs).forEach(input => {
      input?.addEventListener('input', () => {
        setFeedback('');
        if (input === inputs.productBin || input === inputs.productDec) {
          progress.product = false;
          setStatus('product', null, 'Pending');
        } else if (input === inputs.xorDec) {
          progress.xor = false;
          setStatus('xor', null, 'Pending');
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
    renderPlaceTable();
    renderInputTable();
    clearInputs();
    initEvents();
    window.utils?.initStatusHud('binary', {
      score: '#binaryPointsTotal',
      delta: '#binaryPointsDelta',
      progressFill: '#binaryProgressFill',
      progressLabel: '#binaryProgressText'
    });
  });
})();
