/* admin.js — Cyber Escape Rooms (Admin Dashboard)
   - Admin-only auth guard
   - Aggregate localStorage progress/times
   - Render team list + stats
   - Draw charts with Chart.js
   - Controls: reset, logout, confetti/spotlight, notes
   - Neon sync hooks via Netlify Functions (optional)
*/

(function () {
  'use strict';

  // ---------- Helpers ------------------------------------------------------

  const TEAMS = ['team1', 'team2', 'team3', 'team4', 'team5'];

  const PUZZLES = ['phishing', 'password', 'encryption', 'essential', 'binary'];
  const PUZZLE_LABELS = {
    phishing: 'Phishing',
    password: 'Password',
    encryption: 'Encryption',
    essential: 'Essential',
    binary: 'Binary'
  };

  const SCORE_BASE = 100;
  const SCORE_LOG_LIMIT = 60;

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const scoreKey = (team) => `${team}_score`;
  const scoreLogKey = (team) => `${team}_score_log`;

  function getJSON(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : structuredClone(fallback);
    } catch {
      return structuredClone(fallback);
    }
  }

  function setJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function average(nums) {
    const flat = nums.flat ? nums.flat() : [].concat(...nums);
    const arr = flat.filter(n => typeof n === 'number' && isFinite(n));
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function fmtSecs(s) {
    if (s == null) return '—';
    const n = Math.round(s);
    if (n < 60) return `${n}s`;
    const m = Math.floor(n / 60);
    const r = n % 60;
    return `${m}m ${r}s`;
  }

  function announce(msg) {
    // Use global a11y helper if present, else simple console
    if (window.a11y && typeof window.a11y.announce === 'function') {
      window.a11y.announce(msg);
    } else {
      console.log('[a11y]', msg);
    }
  }

  // ---------- Points helpers ----------------------------------------------

  function readScore(team) {
    const raw = localStorage.getItem(scoreKey(team));
    if (raw == null || Number.isNaN(Number(raw))) {
      localStorage.setItem(scoreKey(team), String(SCORE_BASE));
      return SCORE_BASE;
    }
    return Math.max(0, Math.round(Number(raw)));
  }

  function readScoreLog(team) {
    try {
      const log = JSON.parse(localStorage.getItem(scoreLogKey(team)) || '[]');
      return Array.isArray(log) ? log : [];
    } catch {
      return [];
    }
  }

  function persistScore(team, total, delta, reason) {
    const entry = {
      delta,
      reason: reason || (delta >= 0 ? 'Adjustment' : 'Deduction'),
      at: Date.now(),
      total
    };
    let log = readScoreLog(team);
    log.push(entry);
    if (log.length > SCORE_LOG_LIMIT) {
      log = log.slice(log.length - SCORE_LOG_LIMIT);
    }
    localStorage.setItem(scoreLogKey(team), JSON.stringify(log));
    localStorage.setItem(scoreKey(team), String(total));
    return { total, delta, log };
  }

  function adjustTeamScore(team, delta, reason) {
    const adj = Math.round(Number(delta) || 0);
    const current = readScore(team);
    const updated = Math.max(0, current + adj);
    return persistScore(team, updated, adj, reason || 'Manual adjustment');
  }

  function setTeamScore(team, total, reason) {
    const target = Math.max(0, Math.round(Number(total) || 0));
    const current = readScore(team);
    const delta = target - current;
    return persistScore(team, target, delta, reason || 'Set total');
  }

  function resetTeamScore(team, reason = 'Log cleared') {
    const entry = {
      delta: 0,
      reason,
      at: Date.now(),
      total: SCORE_BASE
    };
    localStorage.setItem(scoreKey(team), String(SCORE_BASE));
    localStorage.setItem(scoreLogKey(team), JSON.stringify([entry]));
    return { total: SCORE_BASE, delta: 0, log: [entry] };
  }

  function setTeamPuzzleProgress(team, puzzle, value) {
    const key = `${team}_progress`;
    const progress = getJSON(key, {
      phishing: false,
      password: false,
      encryption: false,
      essential: false,
      binary: false
    });
    progress[puzzle] = !!value;
    setJSON(key, progress);
    const metaKey = `${team}_progress_meta`;
    const meta = getJSON(metaKey, {});
    meta[puzzle] = {
      percent: value ? 100 : 0,
      updatedAt: Date.now()
    };
    setJSON(metaKey, meta);
    announce(`${team.toUpperCase()} ${value ? 'completed' : 'reopened'} ${PUZZLE_LABELS[puzzle] || puzzle}.`);
    refreshAll();
  }

  let teamRows = [];
  let activePointsTeam = null;
  let pointsModalChart = null;

  // ---------- Auth guard ---------------------------------------------------

  function guardAdmin() {
    const user = getJSON('user', null);
    if (!user || user.role !== 'admin') {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  }

  // ---------- Data loading -------------------------------------------------

  function loadTeamData() {
    const rows = [];

    TEAMS.forEach(team => {
      const progress = getJSON(`${team}_progress`, {
        phishing: false,
        password: false,
        encryption: false,
        essential: false,
        binary: false
      });

      const times = getJSON(`${team}_times`, []); // array of seconds per puzzle (optional)

      const completed = PUZZLES.reduce((acc, p) => acc + (progress[p] ? 1 : 0), 0);
      const avgTime = average(times);
      const totalTime = Array.isArray(times)
        ? times.filter(n => typeof n === 'number' && isFinite(n)).reduce((a, b) => a + b, 0)
        : 0;
      const score = readScore(team);
      const scoreLog = readScoreLog(team);
      const progressPercent = Math.round((completed / PUZZLES.length) * 100);

      rows.push({
        team,
        progress,
        times,
        completed,
        avgTime,
        totalTime,
        score,
        scoreLog,
        progressPercent,
        lastLog: scoreLog[scoreLog.length - 1] || null
      });
    });

    return rows;
  }

  // ---------- UI Rendering -------------------------------------------------

  function renderWelcome(user) {
    const welcomeEl = qs('#adminWelcome');
    if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.username.toUpperCase()}!`;
  }

  function renderTeamCards(rows) {
    const listEl = qs('#teamProgressList');
    if (!listEl) return;
    listEl.innerHTML = '';

    rows.forEach(row => {
      const { team, progress, completed, avgTime, totalTime, score, progressPercent, lastLog } = row;
      const puzzleCount = PUZZLES.length;
      const percent = Math.max(0, Math.min(100, Number(progressPercent) || 0));

      const card = document.createElement('article');
      card.className = 'team-card';
      card.dataset.team = team;

      // Header with team name + points / action
      const header = document.createElement('div');
      header.className = 'team-card__header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'team-card__title';

      const h3 = document.createElement('h3');
      h3.textContent = team.toUpperCase();

      const subtitle = document.createElement('small');
      subtitle.textContent = `${completed}/${puzzleCount} puzzles`;

      titleWrap.append(h3, subtitle);

      const actionWrap = document.createElement('div');
      actionWrap.className = 'team-card__action';

      const pointsSpan = document.createElement('span');
      pointsSpan.className = 'team-card__points';
      pointsSpan.textContent = String(score).padStart(3, '0');
      pointsSpan.setAttribute('aria-label', `Score ${score}`);

      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn ghost sm';
      viewBtn.type = 'button';
      viewBtn.dataset.team = team;
      viewBtn.textContent = 'Points log';
      viewBtn.setAttribute('aria-label', `View ${team.toUpperCase()} points log`);
      viewBtn.addEventListener('click', () => openPointsModal(team));

      actionWrap.append(pointsSpan, viewBtn);
      header.append(titleWrap, actionWrap);
      card.appendChild(header);

      // Progress bar
      const progressWrap = document.createElement('div');
      progressWrap.className = 'team-card__progress';

      const track = document.createElement('div');
      track.className = 'team-card__progress-track';

      const fill = document.createElement('div');
      fill.className = 'team-card__progress-fill';
      fill.style.setProperty('--progress', `${percent}%`);
      fill.style.width = `${percent}%`;
      track.appendChild(fill);

      const progressInfo = document.createElement('span');
      progressInfo.className = 'muted';
      progressInfo.textContent = `${completed}/${puzzleCount} puzzles complete`;

      progressWrap.append(track, progressInfo);
      card.appendChild(progressWrap);

      // Meta stats
      const meta = document.createElement('div');
      meta.className = 'team-card__meta';

      const avgSpan = document.createElement('span');
      avgSpan.innerHTML = `Avg time <strong>${fmtSecs(avgTime)}</strong>`;

      const totalSpan = document.createElement('span');
      totalSpan.innerHTML = `Total time <strong>${fmtSecs(totalTime)}</strong>`;

      const lastSpan = document.createElement('span');
      if (lastLog) {
        const change = lastLog.delta || 0;
        const sign = change >= 0 ? '+' : '−';
        const abs = Math.abs(change);
        lastSpan.innerHTML = `Last change <strong>${sign}${abs}</strong>`;
      } else {
        lastSpan.textContent = 'No score changes yet';
      }

      meta.append(avgSpan, totalSpan, lastSpan);
      card.appendChild(meta);

      const badges = document.createElement('div');
      badges.className = 'team-card__badges';

      PUZZLES.forEach(p => {
        const label = PUZZLE_LABELS[p] || (p.charAt(0).toUpperCase() + p.slice(1));
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = `badge ${progress[p] ? 'ok' : 'dim'} badge--interactive`;
        badge.textContent = label;
        badge.dataset.team = team;
        badge.dataset.puzzle = p;
        badge.setAttribute('aria-pressed', progress[p] ? 'true' : 'false');
        badge.setAttribute('aria-label', `${label} ${progress[p] ? 'complete' : 'incomplete'}. Click to toggle.`);
        badge.addEventListener('click', () => {
          const newValue = !progress[p];
          setTeamPuzzleProgress(team, p, newValue);
        });
        badges.appendChild(badge);
      });

      card.appendChild(badges);
      listEl.appendChild(card);
    });
  }

  function renderLockDigits() {
    const lockEl = qs('#lockHow');
    if (!lockEl) return;
    const toDigit = (val, fallback = '—') => {
      const num = Number(val);
      return Number.isFinite(num) && num >= 0 ? String(num) : fallback;
    };
    const d1 = toDigit(localStorage.getItem('lock_digit_phishing_total'), '—');
    const d2 = toDigit(localStorage.getItem('lock_digit_caesar_shift'), '—');
    const pwMinutes = localStorage.getItem('lock_digit_pw_minutes');
    const d3 = toDigit(pwMinutes ?? localStorage.getItem('lock_digit_pw_clues'), '0');
    const d4 = '8';
    const d5 = toDigit(localStorage.getItem('lock_digit_binary'), '—');
    lockEl.textContent = `Vault digits → 1: ${d1} phishing emails • 2: shift ${d2} • 3: clues ${d3} • 4: ${d4} (fixed) • 5: binary product ones digit ${d5}`;
  }

  function renderStats(rows) {
    const statsEl = qs('#averageTimeStats');
    const statTotalTeams = qs('#statTotalTeams');
    const statTotalCompleted = qs('#statTotalCompleted');
    const statAvgTime = qs('#statAvgTime');

    const totalTeams = rows.length;
    const totalCompleted = rows.reduce((a, r) => a + r.completed, 0);
    const overallAvg = average(rows.map(r => r.avgTime).filter(Boolean));
    const averageScore = rows.reduce((acc, r) => acc + (r.score || 0), 0) / (rows.length || 1);

    if (statsEl) {
      statsEl.textContent = `Teams: ${totalTeams} • Avg puzzles completed/team: ${(totalCompleted / totalTeams).toFixed(2)} • Overall avg time: ${fmtSecs(overallAvg)} • Avg score: ${Math.round(averageScore)} pts`;
    }
    if (statTotalTeams) statTotalTeams.textContent = String(totalTeams);
    if (statTotalCompleted) statTotalCompleted.textContent = String(totalCompleted);
    if (statAvgTime) statAvgTime.textContent = fmtSecs(overallAvg);
    renderLockDigits();
  }

  function renderPodium(rows) {
    const list = qs('#adminPodiumList');
    if (!list) return;
    list.innerHTML = '';

    const sorted = rows
      .slice()
      .sort((a, b) => {
        const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const completionDiff = (b.completed ?? 0) - (a.completed ?? 0);
        if (completionDiff !== 0) return completionDiff;
        const aAvg = Number.isFinite(a.avgTime) ? a.avgTime : Infinity;
        const bAvg = Number.isFinite(b.avgTime) ? b.avgTime : Infinity;
        return aAvg - bAvg;
      })
      .slice(0, 3);

    if (!sorted.length) {
      const empty = document.createElement('li');
      empty.className = 'admin-podium__empty';
      empty.textContent = 'Play a round to populate the podium.';
      list.appendChild(empty);
      return;
    }

    sorted.forEach((row, index) => {
      const rank = index + 1;
      const li = document.createElement('li');
      li.className = 'admin-podium__item';
      li.dataset.rank = String(rank);

      const column = document.createElement('div');
      column.className = 'admin-podium__column';

      const rankEl = document.createElement('span');
      rankEl.className = 'admin-podium__rank';
      rankEl.textContent = `#${rank}`;

      const teamEl = document.createElement('strong');
      teamEl.className = 'admin-podium__team';
      teamEl.textContent = row.team.toUpperCase();

      const scoreEl = document.createElement('span');
      scoreEl.className = 'admin-podium__score';
      scoreEl.textContent = `${Math.round(row.score ?? 0)} pts`;

      const metaEl = document.createElement('span');
      metaEl.className = 'admin-podium__meta';
      const avgDisplay = fmtSecs(row.avgTime);
      metaEl.textContent = `${row.completed}/4 puzzles • Avg ${avgDisplay}`;

      column.append(rankEl, teamEl, scoreEl, metaEl);
      li.appendChild(column);
      list.appendChild(li);
    });
  }

  // ---------- Points modal -------------------------------------------------

  const modalRefs = {
    wrapper: null,
    title: null,
    subtitle: null,
    chart: null,
    log: null,
    form: null,
    amount: null,
    totalInput: null,
    reason: null,
    feedback: null,
    resetBtn: null
  };

  function sanitizeScoreLog(team, log = []) {
    const sorted = log.slice().sort((a, b) => (a?.at || 0) - (b?.at || 0));
    const sanitized = [];
    sorted.forEach((entry, idx) => {
      const delta = Math.round(Number(entry?.delta) || 0);
      let total = Number(entry?.total);
      if (!Number.isFinite(total)) {
        if (idx === 0) {
          total = readScore(team);
        } else {
          total = sanitized[idx - 1].total + delta;
        }
      }
      sanitized.push({
        delta,
        total: Math.max(0, Math.round(total)),
        reason: entry?.reason || (delta >= 0 ? 'Adjustment' : 'Deduction'),
        at: entry?.at || Date.now()
      });
    });
    if (!sanitized.length) {
      sanitized.push({
        delta: 0,
        total: readScore(team),
        reason: 'No adjustments yet',
        at: Date.now()
      });
    }
    return sanitized;
  }

  function formatLogTime(ts) {
    const date = new Date(ts);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${day} ${time}`;
  }

  function renderPointsLogTable(container, team, log) {
    if (!container) return;
    container.innerHTML = '';
    if (!log.length) {
      container.textContent = 'No adjustments recorded yet.';
      return;
    }

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['When', 'Change', 'Reason', 'Total'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    log.slice().reverse().forEach(entry => {
      const tr = document.createElement('tr');
      const delta = entry.delta || 0;
      const sign = delta >= 0 ? '+' : '−';
      const abs = Math.abs(delta);

      const when = document.createElement('td');
      when.textContent = formatLogTime(entry.at);

      const change = document.createElement('td');
      change.textContent = `${sign}${abs}`;

      const reason = document.createElement('td');
      reason.textContent = entry.reason || (delta >= 0 ? 'Adjustment' : 'Deduction');

      const total = document.createElement('td');
      total.textContent = String(entry.total);

      tr.append(when, change, reason, total);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
    container.setAttribute('aria-label', `${team} points log`);
  }

  function renderPointsChart(canvas, log) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (pointsModalChart) {
      pointsModalChart.destroy();
      pointsModalChart = null;
    }
    const sorted = log.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const labels = sorted.map(entry => formatLogTime(entry.at));
    const totals = sorted.map(entry => entry.total);

    pointsModalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total points',
            data: totals,
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88,166,255,0.18)',
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#58a6ff'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function hydratePointsModal(row) {
    const { wrapper, title, subtitle, chart, log, amount, totalInput, reason, feedback } = modalRefs;
    if (!wrapper || !row) return;
    const { team, score, scoreLog } = row;
    const friendlyTeam = team.toUpperCase();
    const entries = sanitizeScoreLog(team, scoreLog);

    if (title) title.textContent = `${friendlyTeam} — Points Log`;
    if (subtitle) subtitle.textContent = `Current total: ${score} pts • Entries: ${entries.length}`;
    renderPointsLogTable(log, friendlyTeam, entries);
    renderPointsChart(chart, entries);

    if (amount) amount.value = '0';
    if (totalInput) totalInput.value = '';
    if (reason) reason.value = '';
    if (feedback) feedback.textContent = '';
  }

  function openPointsModal(team) {
    if (!modalRefs.wrapper) return;
    activePointsTeam = team;
    const data = teamRows.find(r => r.team === team);
    if (!data) return;
    hydratePointsModal(data);
    modalRefs.wrapper.classList.add('is-open');
    modalRefs.wrapper.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const closeBtn = modalRefs.wrapper.querySelector('.admin-modal__close');
    if (closeBtn) {
      if (window.utils?.safeFocus) window.utils.safeFocus(closeBtn);
      else closeBtn.focus();
    }
  }

  function closePointsModal() {
    if (!modalRefs.wrapper) return;
    modalRefs.wrapper.classList.remove('is-open');
    modalRefs.wrapper.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    activePointsTeam = null;
  }

  function onPointsAdjustSubmit(ev) {
    ev.preventDefault();
    if (!activePointsTeam) return;
    const amountVal = Number(modalRefs.amount?.value || 0);
    const totalValRaw = modalRefs.totalInput?.value?.trim() || '';
    const reasonVal = modalRefs.reason?.value?.trim() || '';
    if (!reasonVal) {
      if (modalRefs.feedback) modalRefs.feedback.textContent = 'Provide a reason for the adjustment.';
      return;
    }
    if (!totalValRaw && amountVal === 0) {
      if (modalRefs.feedback) modalRefs.feedback.textContent = 'Enter a delta or set a new total.';
      return;
    }

    try {
      if (totalValRaw) {
        setTeamScore(activePointsTeam, Number(totalValRaw), reasonVal);
      } else {
        adjustTeamScore(activePointsTeam, amountVal, reasonVal);
      }
      if (modalRefs.feedback) {
        const freshScore = readScore(activePointsTeam);
        modalRefs.feedback.textContent = `Saved. New total: ${freshScore} pts.`;
      }
      announce(`Updated ${activePointsTeam} score.`);
      refreshAll();
      const updatedRow = teamRows.find(r => r.team === activePointsTeam);
      hydratePointsModal(updatedRow);
    } catch (err) {
      if (modalRefs.feedback) modalRefs.feedback.textContent = `Adjustment failed: ${err.message}`;
    }
  }

  function onPointsResetClick() {
    if (!activePointsTeam) return;
    const confirmed = window.confirm(`Reset ${activePointsTeam.toUpperCase()} points log to base?`);
    if (!confirmed) return;
    resetTeamScore(activePointsTeam, 'Log reset by admin');
    announce(`Reset ${activePointsTeam} points log.`);
    refreshAll();
    const updatedRow = teamRows.find(r => r.team === activePointsTeam);
    hydratePointsModal(updatedRow);
    if (modalRefs.feedback) modalRefs.feedback.textContent = 'Log cleared and score reset to 100.';
  }

  function setupPointsModal() {
    modalRefs.wrapper = qs('#pointsModal');
    if (!modalRefs.wrapper) return;
    modalRefs.title = qs('#pointsModalTitle');
    modalRefs.subtitle = qs('#pointsModalSubtitle');
    modalRefs.chart = qs('#pointsModalChart');
    modalRefs.log = qs('#pointsModalLog');
    modalRefs.form = qs('#pointsAdjustForm');
    modalRefs.amount = qs('#pointsAdjustAmount');
    modalRefs.totalInput = qs('#pointsSetTotal');
    modalRefs.reason = qs('#pointsAdjustReason');
    modalRefs.feedback = qs('#pointsAdjustFeedback');
    modalRefs.resetBtn = qs('#pointsResetBtn');

    modalRefs.wrapper.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', closePointsModal);
    });

    modalRefs.form?.addEventListener('submit', onPointsAdjustSubmit);
    modalRefs.resetBtn?.addEventListener('click', onPointsResetClick);

    modalRefs.wrapper.addEventListener('click', (ev) => {
      if (ev.target === modalRefs.wrapper) closePointsModal();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modalRefs.wrapper.classList.contains('is-open')) {
        closePointsModal();
      }
    });
  }

  // ---------- Charts -------------------------------------------------------

  let progressChart, timeChart;

  function drawCharts(rows) {
    const labels = rows.map(r => r.team.toUpperCase());
    const completedData = rows.map(r => r.completed);
    const avgTimeData = rows.map(r => r.avgTime ?? 0);

    // Progress chart
    const progressCtx = qs('#progressChart')?.getContext('2d');
    if (progressCtx) {
      if (progressChart) progressChart.destroy();
      progressChart = new Chart(progressCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Puzzles Completed',
              data: completedData,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true, max: 4, ticks: { stepSize: 1 } } },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false }
          },
          layout: { padding: 6 }
        }
      });
    }

    // Time chart
    const timeCtx = qs('#timeChart')?.getContext('2d');
    if (timeCtx) {
      if (timeChart) timeChart.destroy();
      timeChart = new Chart(timeCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Avg Completion Time (s)',
              data: avgTimeData,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false }
          },
          layout: { padding: 6 }
        }
      });
    }
  }

  // ---------- Controls -----------------------------------------------------

  function wireChartTabs() {
    const tabs = qsa('.chart-tab');
    const panels = qsa('.chart-panel');
    if (!tabs.length || !panels.length) return;

    const activate = (targetId) => {
      tabs.forEach(tab => {
        const isActive = tab.dataset.target === targetId;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      panels.forEach(panel => {
        const isActive = panel.dataset.panel === targetId;
        panel.classList.toggle('is-active', isActive);
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        activate(tab.dataset.target);
      });
    });

    // Initialize state
    activate(tabs.find(tab => tab.classList.contains('is-active'))?.dataset.target || panels[0].dataset.panel);
  }

  function wireControls(refresh) {
    // Reset all local team progress/times
    qs('#resetAllProgress')?.addEventListener('click', () => {
      if (!confirm('Reset progress and times for all teams?')) return;
      TEAMS.forEach(t => {
        localStorage.removeItem(`${t}_progress`);
        localStorage.removeItem(`${t}_times`);
        resetTeamScore(t, 'Reset via admin');
      });
      localStorage.removeItem('lock_digit_pw_clues');
      localStorage.removeItem('lock_digit_pw_minutes');
      localStorage.removeItem('lock_digit_binary');
      announce('All team progress reset.');
      renderLockDigits();
      refresh();
    });

    // Confetti / Spotlight overlays (simple class toggles)
    const confettiLayer = qs('#confettiLayer');
    const spotlightLayer = qs('#spotlightLayer');

    const podium = qs('.admin-podium');

    qs('#triggerConfetti')?.addEventListener('click', () => {
      if (!confettiLayer) return;
      renderPodium(teamRows);
      confettiLayer.classList.add('is-active');
      confettiLayer.setAttribute('aria-hidden', 'false');
      announce('Celebration!');
      // Auto hide after a few seconds
      setTimeout(() => {
        if (!confettiLayer.classList.contains('podium-visible')) {
          confettiLayer.classList.remove('is-active');
          confettiLayer.setAttribute('aria-hidden', 'true');
        }
      }, 3600);
    });

    qs('#toggleSpotlight')?.addEventListener('click', () => {
      if (!spotlightLayer) return;
      const active = spotlightLayer.classList.toggle('is-active');
      spotlightLayer.setAttribute('aria-hidden', active ? 'false' : 'true');
      announce(active ? 'Spotlight on' : 'Spotlight off');
    });

    qs('#togglePodium')?.addEventListener('click', () => {
      if (!confettiLayer) return;
      const showing = !confettiLayer.classList.contains('podium-visible');
      if (showing) {
        renderPodium(teamRows);
        confettiLayer.classList.add('is-active', 'podium-visible');
        confettiLayer.setAttribute('aria-hidden', 'false');
      } else {
        confettiLayer.classList.remove('podium-visible');
        confettiLayer.classList.remove('is-active');
        confettiLayer.setAttribute('aria-hidden', 'true');
      }
      announce(showing ? 'Podium shown' : 'Podium hidden');
    });

    // Notes
    const notes = qs('#adminNotes');
    const notesStatus = qs('#notesStatus');
    const saved = localStorage.getItem('admin_notes') || '';
    if (notes) notes.value = saved;

    qs('#saveNotesBtn')?.addEventListener('click', () => {
      if (notes) {
        localStorage.setItem('admin_notes', notes.value);
        if (notesStatus) notesStatus.textContent = 'Notes saved.';
        announce('Notes saved');
      }
    });

    qs('#clearNotesBtn')?.addEventListener('click', () => {
      if (notes) {
        notes.value = '';
        localStorage.removeItem('admin_notes');
        if (notesStatus) notesStatus.textContent = 'Notes cleared.';
        announce('Notes cleared');
      }
    });

    // Logout top link is handled in HTML glue; expose global too
    window.logout = function () {
      localStorage.clear();
      window.location.href = 'index.html';
    };

    // Neon sync hooks (optional Netlify Functions)
    qs('#pullNeonBtn')?.addEventListener('click', async () => {
      const status = qs('#syncStatus');
      try {
        if (status) {
          status.textContent = 'Pulling from Neon…';
          status.classList.remove('status-ok', 'status-warn');
        }
        const res = await fetch('/.netlify/functions/pull', { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json(); // expected: { teams: [{team, progress, times}] }
        if (Array.isArray(data.teams)) {
          data.teams.forEach(row => {
            if (!row || !row.team) return;
            if (row.progress) setJSON(`${row.team}_progress`, row.progress);
            if (row.times) setJSON(`${row.team}_times`, row.times);
          });
          if (status) {
            status.textContent = 'Pulled latest stats from Neon.';
            status.classList.add('status-ok');
          }
          announce('Pulled latest stats from Neon.');
          refresh();
        } else {
          if (status) {
            status.textContent = 'No data returned.';
            status.classList.add('status-warn');
          }
        }
      } catch (e) {
        if (status) {
          status.textContent = `Pull failed: ${e.message}`;
          status.classList.add('status-warn');
        }
      }
    });

    qs('#pushNeonBtn')?.addEventListener('click', async () => {
      const status = qs('#syncStatus');
      try {
        if (status) {
          status.textContent = 'Pushing to Neon…';
          status.classList.remove('status-ok', 'status-warn');
        }
        const teams = TEAMS.map(team => ({
          team,
          progress: getJSON(`${team}_progress`, {
            phishing: false,
            password: false,
            encryption: false,
            essential: false,
            binary: false
          }),
          times: getJSON(`${team}_times`, [])
        }));
        const res = await fetch('/.netlify/functions/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (status) {
          status.textContent = 'Push complete.';
          status.classList.add('status-ok');
        }
        announce('Pushed stats to Neon.');
      } catch (e) {
        if (status) {
          status.textContent = `Push failed: ${e.message}`;
          status.classList.add('status-warn');
        }
      }
    });
  }

  // ---------- Boot ---------------------------------------------------------

  function refreshAll() {
    const rows = loadTeamData();
    teamRows = rows;
    renderTeamCards(rows);
    renderStats(rows);
    drawCharts(rows);
    if (activePointsTeam && modalRefs.wrapper?.classList.contains('is-open')) {
      const row = teamRows.find(r => r.team === activePointsTeam);
      if (row) hydratePointsModal(row);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const user = guardAdmin();
    if (!user) return;

    renderWelcome(user);
    setupPointsModal();
    refreshAll();
    wireChartTabs();
    wireControls(refreshAll);
    const throttledRefresh = window.utils?.throttle ? window.utils.throttle(refreshAll, 300) : refreshAll;
    window.addEventListener('storage', throttledRefresh);
  });

})();
