/* password-strength.js
   Shared password strength heuristics for Cyber Escape Rooms.
   Provides crack-time estimates, vault-digit helpers, and feedback.
*/

(function () {
  'use strict';

  const FAST_RATE = 7e10; // 70 billion guesses per second (GPU cluster level)

  const COMMON_PASSWORD_SECONDS = new Map([
    ['password', 3],
    ['password1', 6],
    ['password123', 10],
    ['123456', 0.5],
    ['123456789', 1.2],
    ['12345678', 1],
    ['12345', 0.4],
    ['qwerty', 2.5],
    ['qwerty123', 6],
    ['iloveyou', 4],
    ['111111', 0.6],
    ['abc123', 2.2],
    ['football', 6],
    ['dragon', 5],
    ['monkey', 4],
    ['letmein', 5],
    ['welcome', 5],
    ['sunshine', 5],
    ['princess', 5],
    ['admin', 2],
    ['login', 2],
    ['starwars', 5],
    ['freedom', 4],
    ['whatever', 6],
    ['baseball', 6],
    ['shadow', 4],
    ['hunter2', 4]
  ]);

  const COMMON_WORDS = new Set([
    'dragon', 'football', 'iloveyou', 'princess', 'sunshine', 'monkey',
    'welcome', 'master', 'shadow', 'hunter', 'baseball', 'freedom',
    'whatever', 'trustno1', 'letmein', 'dragonfly', 'soccer', 'hammer',
    'pokemon', 'cheese', 'butter', 'coffee', 'football', 'coconut',
    'diamond', 'thunder', 'captain', 'ginger', 'computer', 'internet',
    'security', 'password', 'summer', 'winter', 'spring', 'autumn'
  ]);

  const KEY_SEQUENCES = [
    '0123456789',
    '9876543210',
    'abcdefghijklmnopqrstuvwxyz',
    'zyxwvutsrqponmlkjihgfedcba',
    'qwertyuiop',
    'poiuytrewq',
    'asdfghjkl',
    'lkjhgfdsa',
    'zxcvbnm',
    'mnbvcxz'
  ];

  function isSequential(sample) {
    if (!sample || sample.length < 4) return false;
    const lower = sample.toLowerCase();
    if (KEY_SEQUENCES.some(seq => seq.includes(lower))) return true;

    let ascending = true;
    let descending = true;
    for (let i = 1; i < lower.length; i++) {
      const diff = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
      if (diff !== 1) ascending = false;
      if (diff !== -1) descending = false;
      if (!ascending && !descending) break;
    }
    return ascending || descending;
  }

  function isRepeating(sample) {
    if (!sample || sample.length < 3) return false;
    const lower = sample.toLowerCase();
    if (/^(.)\1+$/.test(lower)) return true;
    for (let size = 1; size <= Math.floor(lower.length / 2); size++) {
      const token = lower.slice(0, size);
      if (token.repeat(lower.length / size) === lower) return true;
    }
    return false;
  }

  function fallbackComplexity(sample) {
    if (!sample) return 0;
    let pool = 0;
    if (/[a-z]/.test(sample)) pool += 26;
    if (/[A-Z]/.test(sample)) pool += 26;
    if (/[0-9]/.test(sample)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(sample)) pool += 32;
    if (pool === 0) pool = 26;
    const combos = Math.pow(pool, sample.length);
    let seconds = combos / FAST_RATE;
    if (isSequential(sample) || isRepeating(sample)) {
      seconds = Math.min(seconds, Math.max(0.2, sample.length * 0.4));
    }
    return seconds;
  }

  function dictionarySeconds(normalized) {
    if (!normalized) return null;
    if (COMMON_PASSWORD_SECONDS.has(normalized)) {
      return COMMON_PASSWORD_SECONDS.get(normalized);
    }
    if (COMMON_WORDS.has(normalized)) {
      return 5;
    }
    return null;
  }

  function estimateSeconds(sample) {
    if (!sample) return { seconds: 0.05, method: 'empty' };
    const normalized = sample.toLowerCase();

    const dictionary = dictionarySeconds(normalized);
    if (dictionary !== null) {
      return { seconds: dictionary, method: 'common password dictionary' };
    }

    if (isSequential(sample)) {
      return { seconds: Math.max(0.25, sample.length * 0.35), method: 'sequential pattern' };
    }

    if (isRepeating(sample)) {
      return { seconds: Math.max(0.3, sample.length * 0.5), method: 'repeated pattern' };
    }

    const modMatch = normalized.match(/^([a-z]+)(\d{1,4})$/);
    if (modMatch) {
      const base = dictionarySeconds(modMatch[1]);
      if (base !== null) {
        const digits = modMatch[2].length;
        const seconds = base * Math.pow(10, digits);
        return { seconds: Math.max(base * 2, seconds), method: 'dictionary word plus numbers' };
      }
    }

    if (/^\d+$/.test(sample)) {
      const seconds = Math.pow(10, sample.length) / FAST_RATE;
      return { seconds: Math.max(seconds, 0.4), method: 'numeric only' };
    }

    if (/^[a-z]+$/.test(normalized)) {
      const space = Math.pow(26, Math.min(normalized.length, 4));
      const seconds = Math.max(3, (space * 500) / FAST_RATE);
      return { seconds, method: 'lowercase word' };
    }

    if (/^[a-z0-9]+$/.test(normalized)) {
      const seconds = Math.pow(36, Math.max(sample.length - 1, 1)) / FAST_RATE;
      return { seconds, method: 'letters & numbers' };
    }

    if (/^[a-zA-Z]+$/.test(sample)) {
      const seconds = Math.pow(52, Math.max(sample.length - 1, 1)) / FAST_RATE;
      return { seconds, method: 'letters only' };
    }

    if (/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]+$/.test(sample)) {
      const seconds = Math.pow(94, Math.max(sample.length - 2, 2)) / FAST_RATE;
      return { seconds, method: 'printable ascii' };
    }

    return { seconds: fallbackComplexity(sample), method: 'complexity estimate' };
  }

  function strengthScale(seconds) {
    if (!Number.isFinite(seconds)) return 10;
    if (seconds < 1) return 0;
    if (seconds < 60) return 1;
    if (seconds < 3600) return 3;
    if (seconds < 86400) return 4;
    if (seconds < 604800) return 5;
    if (seconds < 2592000) return 6;
    if (seconds < 31536000) return 7;
    if (seconds < 315360000) return 8;
    if (seconds < 3153600000) return 9;
    return 10;
  }

  function strengthScore(seconds) {
    if (!Number.isFinite(seconds) || seconds >= 315360000) return 4;
    if (seconds >= 31536000) return 3;
    if (seconds >= 86400) return 2;
    if (seconds >= 3600) return 1;
    return 0;
  }

  function crackSecondsToDigit(seconds) {
    if (!Number.isFinite(seconds) || seconds === Infinity) return 9;
    const minutes = Math.max(1, Math.round(seconds / 60));
    return Math.min(9, minutes);
  }

  function formatCrackTime(seconds) {
    if (!Number.isFinite(seconds) || seconds === Infinity) {
      return 'Centuries+';
    }
    if (seconds < 0.5) return '<1 second';
    if (seconds < 60) {
      const s = Math.round(seconds);
      return `${s} second${s === 1 ? '' : 's'}`;
    }
    const mins = seconds / 60;
    if (mins < 60) {
      const whole = Math.floor(mins);
      const remainder = Math.round((mins - whole) * 60);
      return remainder ? `${whole}m ${remainder}s` : `${whole} minute${whole === 1 ? '' : 's'}`;
    }
    const hours = mins / 60;
    if (hours < 48) {
      const whole = Math.floor(hours);
      const remainder = Math.round((hours - whole) * 60);
      return remainder ? `${whole}h ${remainder}m` : `${whole} hour${whole === 1 ? '' : 's'}`;
    }
    const days = hours / 24;
    if (days < 365) {
      const whole = Math.floor(days);
      return `${whole} day${whole === 1 ? '' : 's'}`;
    }
    const years = days / 365;
    if (years < 1000) {
      const rounded = years >= 10 ? Math.round(years) : Number(years.toFixed(1));
      return `${rounded} year${rounded === 1 ? '' : 's'}`;
    }
    const millennia = years / 1000;
    return `${millennia.toFixed(1)} millennia`;
  }

  function suggestionsFor(sample, seconds, method) {
    const list = [];
    if (!sample) {
      list.push('Enter a password to analyse it.');
      return list;
    }
    if (COMMON_PASSWORD_SECONDS.has(sample.toLowerCase())) {
      list.push('Avoid top leaked passwords—attackers try them first.');
    }
    if (/^\d+$/.test(sample)) {
      list.push('Mix in letters and punctuation; all digits are trivial to brute-force.');
    }
    if (/^[a-z]+$/.test(sample)) {
      list.push('Add uppercase, numbers, or symbols to increase complexity.');
    }
    if (isSequential(sample)) {
      list.push('Break up obvious sequences like "1234" or keyboard runs.');
    }
    if (isRepeating(sample)) {
      list.push('Avoid repeating the same pattern—attackers detect loops.');
    }
    if (sample.length < 12) {
      list.push('Aim for 12+ characters for stronger protection.');
    }
    if (seconds < 31536000) {
      list.push('Consider using a passphrase made of unrelated words.');
    }
    if (list.length === 0 && method) {
      list.push(`Detected pattern: ${method}. Keep mixing character types and length for safety.`);
    }
    return list;
  }

  function analyze(sample) {
    const { seconds, method } = estimateSeconds(sample);
    const digit = crackSecondsToDigit(seconds);
    const score = strengthScore(seconds);
    const level = strengthScale(seconds);
    const suggestions = suggestionsFor(sample, seconds, method);
    return {
      seconds,
      method,
      crackTime: formatCrackTime(seconds),
      digit,
      score,
      scale: level,
      suggestions
    };
  }

  window.PasswordStrength = {
    analyze,
    crackSecondsToDigit,
    formatCrackTime,
    strengthScale,
    FAST_RATE
  };
})();
