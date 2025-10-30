/* endless.js — Endless Challenge for Cyber Escape Rooms */
(function () {
  'use strict';

  const utils = window.utils || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const announce = (msg) => { try { window.a11y?.announce?.(msg); } catch (_) {} };

  const MAX_STRIKES = 3;
  const BASE_TIME = 22;

  const QUESTIONS = [
    // Tier 1 — fundamentals
    { tier: 1, prompt: 'Which password is safest to reuse across sites?', options: ['None — every site needs a unique one', 'The one with the most numbers'], correct: 0, note: 'Unique passwords stop breaches from cascading.' },
    { tier: 1, prompt: 'You receive an unexpected file sharing link from HR. What should you do first?', options: ['Hover over the link to inspect the URL', 'Open it quickly before it expires'], correct: 0, note: 'Always verify the destination before clicking.' },
    { tier: 1, prompt: 'Why enable automatic software updates?', options: ['They patch known security flaws', 'They make devices slower on purpose'], correct: 0, note: 'Updates fix vulnerabilities attackers target.' },
    { tier: 1, prompt: 'Multi-factor authentication adds…', options: ['Another step beyond the password', 'A stronger password requirement only'], correct: 0, note: 'MFA combines something you know with something you have or are.' },
    // Tier 2 — moderate
    { tier: 2, prompt: 'Which signal usually means a phishing email?', options: ['Urgent action demanded with a generic greeting', 'Message digitally signed from your security team'], correct: 0, note: 'Phishers create urgency and use impersonal wording.' },
    { tier: 2, prompt: 'Why segment internal networks?', options: ['To contain attacker movement if one segment is compromised', 'To make printers easier to find'], correct: 0, note: 'Segmentation keeps intruders from roaming freely.' },
    { tier: 2, prompt: 'An employee plugs in an unknown USB stick. What control reduces this risk?', options: ['Application control / device control', 'Giving everyone admin rights'], correct: 0, note: 'Restricting devices prevents unapproved executables from running.' },
    { tier: 2, prompt: 'Which log is most helpful after spotting suspicious sign-ins?', options: ['Identity provider or SSO logs', 'Social media activity logs'], correct: 0, note: 'SSO logs show where and how the account was abused.' },
    // Tier 3 — advanced
    { tier: 3, prompt: 'An attacker captured hashed passwords. Which defence limits the impact?', options: ['Using slow, salted hash algorithms', 'Keeping hashes in plain text for easy resets'], correct: 0, note: 'Slow, salted hashes dramatically increase cracking cost.' },
    { tier: 3, prompt: 'What does threat hunting primarily look for?', options: ['Indicators of compromise already inside the environment', 'Misconfigured printers only'], correct: 0, note: 'Threat hunting searches for stealthy adversary behaviour.' },
    { tier: 3, prompt: 'Why enforce least privilege on service accounts?', options: ['To reduce blast radius if they leak', 'So they can log into user workstations'], correct: 0, note: 'Minimal permissions limit the damage from compromised accounts.' },
    { tier: 3, prompt: 'What is the main benefit of immutable backups?', options: ['Ransomware cannot encrypt or delete them', 'They save bandwidth during peak hours'], correct: 0, note: 'Immutable backups provide a clean restore point.' }
  ];

  function teamId() {
    const user = typeof utils.readUser === 'function' ? utils.readUser() : (function () {
      try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
    }());
    return (user?.username || 'team').toLowerCase();
  }

  const LEADERBOARD_KEY = `${teamId()}_endless_scores`;

  function loadLeaderboard() {
    try {
      const data = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveLeaderboard(entries) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  }

  function recordScore(name, score, level) {
    const trimmed = (name || '').trim();
    const entry = {
      name: trimmed || 'Anonymous',
      score,
      level,
      at: Date.now()
    };
    const board = loadLeaderboard();
    board.push(entry);
    board.sort((a, b) => b.score - a.score || b.level - a.level || b.at - a.at);
    saveLeaderboard(board.slice(0, 10));
    renderLeaderboard();
    window.stateSync?.queueSave?.('endless');
  }

  const state = {
    activeQuestion: null,
    score: 0,
    level: 1,
    strikes: 0,
    timerId: null,
    timeRemaining: 0,
    live: false
  };

  const refs = {
    score: $('#endlessScore'),
    level: $('#endlessLevel'),
    strikes: $('#endlessStrikes'),
    timer: $('#endlessTimer'),
    prompt: $('#endlessPrompt'),
    options: $('#endlessOptions'),
    startBtn: $('#endlessStartBtn'),
    skipBtn: $('#endlessSkipBtn'),
    feedback: $('#endlessFeedback')
  };

  function difficultyTier() {
    return Math.min(3, Math.floor(state.score / 5) + 1);
  }

  function timerLimit() {
    return Math.max(8, BASE_TIME - (difficultyTier() * 2));
  }

  function formatTime(seconds) {
    return `${seconds}s`;
  }

  function updateHud() {
    if (refs.score) refs.score.textContent = String(state.score);
    if (refs.level) refs.level.textContent = String(difficultyTier());
    if (refs.strikes) refs.strikes.textContent = `${state.strikes}/${MAX_STRIKES}`;
    if (refs.timer) refs.timer.textContent = state.live ? formatTime(state.timeRemaining) : '—';
  }

  function clearFeedback() {
    if (refs.feedback) {
      refs.feedback.textContent = '';
      refs.feedback.classList.remove('ok', 'warn');
    }
  }

  function setFeedback(message, tone = 'info') {
    if (!refs.feedback) return;
    refs.feedback.textContent = message;
    refs.feedback.classList.remove('ok', 'warn');
    if (tone === 'success') refs.feedback.classList.add('ok');
    if (tone === 'warn') refs.feedback.classList.add('warn');
    announce(message);
  }

  function pickQuestion() {
    const tier = difficultyTier();
    const pool = QUESTIONS.filter(q => q.tier <= tier);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderQuestion(question) {
    if (!question) return;
    state.activeQuestion = question;
    if (refs.prompt) refs.prompt.textContent = question.prompt;
    if (refs.options) {
      refs.options.innerHTML = '';
      question.options.forEach((option, idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.type = 'button';
        btn.textContent = option;
        btn.dataset.index = String(idx);
        btn.addEventListener('click', () => submitAnswer(idx));
        refs.options.appendChild(btn);
      });
    }
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function tickTimer() {
    state.timeRemaining -= 1;
    updateHud();
    if (state.timeRemaining <= 0) {
      stopTimer();
      setFeedback('Out of time. Strike added.', 'warn');
      addStrike();
    }
  }

  function startTimer() {
    stopTimer();
    state.timeRemaining = timerLimit();
    state.timerId = setInterval(tickTimer, 1000);
    updateHud();
  }

  function addStrike() {
    state.strikes += 1;
    updateHud();
    if (state.strikes >= MAX_STRIKES) {
      endRun('Run ended — three strikes.');
    } else {
      loadNextQuestion();
    }
  }

  function submitAnswer(choiceIndex) {
    if (!state.live || !state.activeQuestion) return;
    stopTimer();
    const correct = Number(choiceIndex) === state.activeQuestion.correct;
    if (correct) {
      state.score += 1;
      setFeedback('Correct! Keep going.', 'success');
      loadNextQuestion();
    } else {
      setFeedback(state.activeQuestion.note || 'Not quite. Study the explanation before the next round.', 'warn');
      addStrike();
    }
    updateHud();
  }

  function loadNextQuestion() {
    if (!state.live) return;
    clearFeedback();
    const question = pickQuestion();
    renderQuestion(question);
    startTimer();
  }

  function resetRunState() {
    state.score = 0;
    state.strikes = 0;
    state.activeQuestion = null;
    state.live = false;
    stopTimer();
    updateHud();
    if (refs.options) refs.options.innerHTML = '';
    if (refs.prompt) refs.prompt.textContent = 'Press start to begin.';
    if (refs.skipBtn) refs.skipBtn.setAttribute('disabled', 'true');
    if (refs.startBtn) refs.startBtn.removeAttribute('disabled');
  }

  function endRun(reason) {
    const finalScore = state.score;
    const finalLevel = difficultyTier();
    const message = reason || 'Run ended.';

    state.live = false;
    stopTimer();
    updateHud();
    if (refs.skipBtn) refs.skipBtn.setAttribute('disabled', 'true');
    if (refs.startBtn) refs.startBtn.removeAttribute('disabled');

    if (finalScore > 0) {
      const name = window.prompt('Nice streak! Add your name to the leaderboard:', 'Team member');
      recordScore(name, finalScore, finalLevel);
    }

    resetRunState();
    setFeedback(message, 'warn');
  }

  function startRun() {
    state.live = true;
    state.score = 0;
    state.strikes = 0;
    clearFeedback();
    updateHud();
    if (refs.startBtn) refs.startBtn.setAttribute('disabled', 'true');
    if (refs.skipBtn) refs.skipBtn.removeAttribute('disabled');
    loadNextQuestion();
  }

  function skipQuestion() {
    if (!state.live) return;
    setFeedback('Question skipped. Strike added.', 'warn');
    addStrike();
  }

  function renderLeaderboard() {
    const list = $('#endlessLeaderboard');
    if (!list) return;
    const entries = loadLeaderboard();
    list.innerHTML = '';
    if (!entries.length) {
      const li = document.createElement('li');
      li.textContent = 'No runs recorded yet. Be the first!';
      list.appendChild(li);
      return;
    }
    entries.forEach(entry => {
      const li = document.createElement('li');
      const date = new Date(entry.at || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      li.innerHTML = `<strong>${entry.name}</strong> — ${entry.score} pts • level ${entry.level} <span class="muted">(${date})</span>`;
      list.appendChild(li);
    });
  }

  function resetLeaderboard() {
    if (!window.confirm('Clear the endless leaderboard for this team?')) return;
    saveLeaderboard([]);
    renderLeaderboard();
    window.stateSync?.queueSave?.('endless-reset');
  }

  document.addEventListener('DOMContentLoaded', () => {
    resetRunState();
    renderLeaderboard();
    refs.startBtn?.addEventListener('click', startRun);
    refs.skipBtn?.addEventListener('click', skipQuestion);
    $('#endlessResetBoard')?.addEventListener('click', resetLeaderboard);
    window.addEventListener('endless:sync', () => renderLeaderboard());
  });
})();
