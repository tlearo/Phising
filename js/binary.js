(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const BINARY_A = '1101';
  const BINARY_B = '1011';
  const DEC_A = parseInt(BINARY_A, 2);
  const DEC_B = parseInt(BINARY_B, 2);
  const XOR_BIN = xorStrings(BINARY_A, BINARY_B);
  const XOR_DEC = parseInt(XOR_BIN, 2);
  const VAULT_DIGIT = XOR_DEC;

  const BIT_LENGTH = Math.max(BINARY_A.length, BINARY_B.length);
  const POSITIONS = Array.from({ length: BIT_LENGTH }, (_, i) => BIT_LENGTH - 1 - i);
  const PLACE_VALUES = POSITIONS.map(exp => 2 ** exp);

  const inputs = {
    decA: $('#decAInput'),
    decB: $('#decBInput'),
    xorDec: $('#xorDec')
  };

  const status = {
    a: $('#valueAStatus'),
    b: $('#valueBStatus'),
    xor: $('#xorStatus')
  };

  const sumLabels = {
    a: $('#binarySumA'),
    b: $('#binarySumB'),
    xor: $('#binarySumXor')
  };

  const feedbackEl = $('#binaryFeedback');
  const chestHint = $('#binaryChestHint');
  const hintBtn = $('#binaryHintBtn');
  const hintBox = $('#binaryHintText');
  const vaultDigitDisplay = $('#binaryVaultDigit');

  const points = window.utils?.points;
  points?.ensure();

  let hintUsed = false;

  const progress = {
    decimals: false,
    xor: false
  };

  function updateVaultDigitDisplay(forceValue) {
    if (!vaultDigitDisplay) return;
    if (forceValue) {
      vaultDigitDisplay.textContent = forceValue;
      return;
    }
    try {
      const progress = window.utils?.readProgress?.() || {};
      const stored = localStorage.getItem('lock_digit_binary');
      if (progress.binary && stored) {
        vaultDigitDisplay.textContent = stored;
      } else {
        vaultDigitDisplay.textContent = '—';
      }
    } catch (_) {
      vaultDigitDisplay.textContent = '—';
    }
  }

  updateVaultDigitDisplay();

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
    if (progress.decimals) percent = 60;
    if (progress.decimals && progress.xor) percent = 100;
    setter('binary', percent, { complete: progress.decimals && progress.xor });
  }

  function resetProgress() {
    progress.decimals = false;
    progress.xor = false;
    updateProgressState();
  }

  function populateDefaults() {
    $('#binaryA')?.replaceChildren(document.createTextNode(BINARY_A.padStart(BIT_LENGTH, '0')));
    $('#binaryB')?.replaceChildren(document.createTextNode(BINARY_B.padStart(BIT_LENGTH, '0')));
  }

  function clearInputs() {
    Object.values(inputs).forEach(input => { if (input) input.value = ''; });
    setStatus('a', null, 'Decimal pending');
    setStatus('b', null, 'Decimal pending');
    setStatus('xor', null, 'Pending');
    setFeedback('');
    chestHint?.setAttribute('hidden', 'hidden');
    hintBox?.setAttribute('hidden', 'hidden');
    hintUsed = false;
    progress.decimals = false;
    progress.xor = false;
    updateProgressState();
    updateSums();
  }

  function describeBits(bits) {
    if (!bits || bits.length !== BIT_LENGTH) return 'Use the highlighted columns to add their values.';
    if (/[^01]/.test(bits)) return 'Bits must be either 0 or 1.';
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
    return `Add ${contributions.join(' + ')}`;
  }

  function updateSums() {
    const aBits = BINARY_A.padStart(BIT_LENGTH, '0');
    const bBits = BINARY_B.padStart(BIT_LENGTH, '0');
    const xorBits = XOR_BIN.padStart(BIT_LENGTH, '0');
    if (sumLabels.a) {
      sumLabels.a.textContent = `Binary A contributions: ${describeBits(aBits)}`;
    }
    if (sumLabels.b) {
      sumLabels.b.textContent = `Binary B contributions: ${describeBits(bBits)}`;
    }
    if (sumLabels.xor) {
      sumLabels.xor.textContent = `XOR contributions: ${describeBits(xorBits)}`;
    }
  }

  function checkDecimalInputs() {
    let ok = true;
    const aVal = Number(inputs.decA?.value || NaN);
    const bVal = Number(inputs.decB?.value || NaN);
    if (!Number.isInteger(aVal) || aVal !== DEC_A) {
      setStatus('a', false, 'Binary A decimal does not match the highlighted columns.');
      ok = false;
    } else {
      setStatus('a', true, 'Binary A confirmed.');
    }
    if (!Number.isInteger(bVal) || bVal !== DEC_B) {
      setStatus('b', false, 'Binary B decimal does not match the highlighted columns.');
      ok = false;
    } else {
      setStatus('b', true, 'Binary B confirmed.');
    }
    progress.decimals = ok;
    return ok;
  }

  function checkXor(decimalsOk) {
    if (!decimalsOk) {
      setStatus('xor', false, 'Convert both decimals first.');
      progress.xor = false;
      return false;
    }

    const decInput = Number(inputs.xorDec?.value || NaN);
    if (!Number.isInteger(decInput)) {
      setStatus('xor', false, 'Enter the XOR decimal using digits only.');
      progress.xor = false;
      return false;
    }
    if (decInput !== XOR_DEC) {
      setStatus('xor', false, 'XOR decimal should equal the sum of the mismatched columns. Recheck your table.');
      progress.xor = false;
      return false;
    }

    setStatus('xor', true, 'XOR confirmed.');
    progress.xor = true;
    return true;
  }

  function storeLockDigit() {
    try {
      localStorage.setItem('lock_digit_binary', String(VAULT_DIGIT));
    } catch (_) {
      /* ignore */
    }
    updateVaultDigitDisplay(String(VAULT_DIGIT));
  }

  function markBinaryComplete() {
    const setter = window.utils?.setProgressPercent;
    setter?.('binary', 100, { complete: true });
    const flag = window.utils?.setProgressFlag;
    flag?.('binary', true);
    storeLockDigit();
    window.stateSync?.queueSave?.('binary-complete');
  }

  function handleCheck() {
    const alreadyComplete = window.utils?.readProgress?.()?.binary;
    const decimalsOk = checkDecimalInputs();
    const xorOk = checkXor(decimalsOk);
    updateProgressState();

    if (decimalsOk && xorOk) {
      setFeedback(`Success! All conversions check out. Vault digit captured: ${VAULT_DIGIT}.`, true);
      chestHint?.removeAttribute('hidden');
      markBinaryComplete();
      if (!alreadyComplete) {
        window.vault?.unlock('binary', VAULT_DIGIT, {
          message: `Binary digit ${VAULT_DIGIT} recorded. Enter it on the vault panel.`
        });
      }
    } else if (decimalsOk) {
      setFeedback('Decimals confirmed. Now enter the XOR decimal using the differing columns.', false);
      chestHint?.setAttribute('hidden', 'hidden');
    } else {
      setFeedback('Not yet. Add the highlighted columns to convert each binary to decimal first.', false);
      chestHint?.setAttribute('hidden', 'hidden');
    }
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
      { label: 'Binary A', digits: BINARY_A.padStart(BIT_LENGTH, '0'), rowClass: 'binary-row-a' },
      { label: 'Binary B', digits: BINARY_B.padStart(BIT_LENGTH, '0'), rowClass: 'binary-row-b' },
      { label: 'A XOR B', digits: XOR_BIN.padStart(BIT_LENGTH, '0'), rowClass: 'binary-row-xor' }
    ];

    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = row.rowClass;
      const th = document.createElement('th');
      th.scope = 'row';
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

    const guideRow = document.createElement('tr');
    guideRow.className = 'binary-guides-row';
    const guideTh = document.createElement('th');
    guideTh.textContent = 'Column value if bit = 1';
    guideRow.appendChild(guideTh);
    PLACE_VALUES.forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      td.className = 'binary-guide-cell';
      guideRow.appendChild(td);
    });
    tbody.appendChild(guideRow);

    table.appendChild(tbody);
    updateSums();
  }

  function initEvents() {
    $('#binaryCheck')?.addEventListener('click', handleCheck);
    $('#binaryReset')?.addEventListener('click', () => {
      clearInputs();
      setFeedback('');
    });

    hintBtn?.addEventListener('click', () => {
      if (hintUsed) {
        setFeedback('Hint already revealed - add the green columns for each binary, then keep only the mismatched ones for XOR.', true);
        return;
      }
      hintUsed = true;
      hintBox?.removeAttribute('hidden');
      points?.spend(5, 'Binary hint');
      setFeedback('Hint revealed. Sum the green columns to get each decimal, then total only the differing columns for the XOR digit.', true);
    });

    Object.values(inputs).forEach(input => {
      input?.addEventListener('input', () => {
        setFeedback('');
        if (input === inputs.decA) {
          progress.decimals = false;
          setStatus('a', null, 'Decimal pending');
        } else if (input === inputs.decB) {
          progress.decimals = false;
          setStatus('b', null, 'Decimal pending');
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
