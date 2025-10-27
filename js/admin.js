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
  const STALLED_MS = 15 * 60 * 1000; // 15 minutes of no progress

  const DEFAULT_PROGRESS = {
    phishing: false,
    password: false,
    encryption: false,
    essential: false,
    binary: false
  };

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const scoreKey = (team) => `${team}_score`;
  const scoreLogKey = (team) => `${team}_score_log`;
  const activityKey = (team) => `${team}_activity`;
  const vaultKey = (team) => `${team}_vault`;
  const activityFilter = { team: 'all', type: 'all' };
  let activityFiltersReady = false;
  const syncDiagnosticsEl = qs('#syncDiagnostics');

  function noteSync(type, message, tone = 'info') {
    if (!syncDiagnosticsEl) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    syncDiagnosticsEl.textContent = `[${timestamp}] ${type}: ${message}`;
    syncDiagnosticsEl.dataset.tone = tone;
  }

  function normalizeProgress(raw, issues) {
    const cleaned = { ...DEFAULT_PROGRESS };
    PUZZLES.forEach(puzzle => {
      const value = !!raw?.[puzzle];
      if (raw && typeof raw[puzzle] !== 'boolean' && raw[puzzle] != null) {
        issues.push(`Progress.${puzzle} normalized`);
      }
      cleaned[puzzle] = value;
    });
    return cleaned;
  }

  function normalizeProgressMeta(raw, issues) {
    const meta = {};
    if (!raw || typeof raw !== 'object') return meta;
    Object.entries(raw).forEach(([key, value]) => {
      const percent = Math.max(0, Math.min(100, Math.round(Number(value?.percent ?? value ?? 0))));
      const updated = Number(value?.updatedAt ?? Date.now());
      if (!Number.isFinite(percent)) issues.push(`Progress meta ${key} percent reset`);
      if (!Number.isFinite(updated)) issues.push(`Progress meta ${key} timestamp reset`);
      meta[key] = {
        percent: Number.isFinite(percent) ? percent : 0,
        updatedAt: Number.isFinite(updated) ? updated : Date.now()
      };
    });
    return meta;
  }

  function normalizeTimes(raw, issues) {
    if (!Array.isArray(raw)) {
      if (raw != null) issues.push('Time log reset (invalid shape)');
      return [];
    }
    const filtered = raw
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && n >= 0);
    if (filtered.length !== raw.length) issues.push('Time log sanitized');
    return filtered;
  }

  function normalizeScore(raw, issues) {
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      issues.push('Score reset to base');
      return SCORE_BASE;
    }
    return Math.max(0, Math.round(num));
  }

  function normalizeScoreLog(raw, issues, fallbackTotal) {
    if (!Array.isArray(raw)) {
      if (raw != null) issues.push('Score log reset (invalid shape)');
      return [];
    }
    const sanitized = raw.map(entry => {
      const delta = Number(entry?.delta ?? 0);
      const total = Number(entry?.total ?? fallbackTotal);
      const at = Number(entry?.at ?? Date.now());
      const reason = entry?.reason || 'update';
      if (!Number.isFinite(delta) || !Number.isFinite(total) || !Number.isFinite(at)) {
        issues.push('Score log entry normalized');
      }
      return {
        delta: Number.isFinite(delta) ? Math.round(delta) : 0,
        total: Number.isFinite(total) ? Math.max(0, Math.round(total)) : fallbackTotal,
        at: Number.isFinite(at) ? at : Date.now(),
        reason
      };
    });
    return sanitized.slice(-SCORE_LOG_LIMIT);
  }

  function normalizeActivity(raw, issues) {
    if (!Array.isArray(raw)) {
      if (raw != null) issues.push('Activity log reset (invalid shape)');
      return [];
    }
    return raw.map(entry => {
      const at = Number(entry?.at ?? Date.now());
      const normalized = {
        type: entry?.type || 'event',
        detail: entry?.detail || '',
        puzzle: entry?.puzzle || null,
        status: entry?.status || null,
        delta: Number.isFinite(Number(entry?.delta)) ? Number(entry.delta) : null,
        total: Number.isFinite(Number(entry?.total)) ? Number(entry.total) : null,
        reason: entry?.reason || null,
        at: Number.isFinite(at) ? at : Date.now()
      };
      if (!Number.isFinite(at)) issues.push('Activity entry timestamp normalized');
      return normalized;
    });
  }

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

  function timeAgo(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    if (diff < 86400000) {
      const hrs = Math.floor(diff / 3600000);
      return `${hrs}h ago`;
    }
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }

  function readVault(team) {
    return getJSON(vaultKey(team), {});
  }

  function writeVault(team, value) {
    setJSON(vaultKey(team), value || {});
  }

  function logTeamActivity(team, entry) {
    const key = activityKey(team);
    const list = getJSON(key, []);
    const normalized = {
      type: entry?.type || 'event',
      detail: entry?.detail || '',
      puzzle: entry?.puzzle || null,
      status: entry?.status || null,
      delta: entry?.delta ?? null,
      reason: entry?.reason || null,
      total: entry?.total ?? null,
      at: entry?.at || Date.now()
    };
    list.push(normalized);
    if (list.length > SCORE_LOG_LIMIT * 2) {
      list.splice(0, list.length - SCORE_LOG_LIMIT * 2);
    }
    setJSON(key, list);
    return list;
  }

  function getTeamStateSnapshot(team) {
    return {
      team,
      progress: getJSON(`${team}_progress`, { ...DEFAULT_PROGRESS }),
      progressMeta: getJSON(`${team}_progress_meta`, {}),
      times: getJSON(`${team}_times`, []),
      score: readScore(team),
      scoreLog: readScoreLog(team),
      activity: getJSON(activityKey(team), []),
      vault: readVault(team)
    };
  }

  const pendingPushes = new Map();

  async function pushTeamState(team, reason = 'admin-update') {
    if (!team) return;
    pendingPushes.delete(team);
    const snapshot = getTeamStateSnapshot(team);
    try {
      const res = await fetch('/.netlify/functions/team-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...snapshot, reason })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('Team sync failed', team, err);
      noteSync('Auto push', `${team} sync failed: ${err.message}`, 'warn');
    }
  }

  function queueTeamPush(team, reason = 'admin-update') {
    if (!team) return;
    if (pendingPushes.has(team)) clearTimeout(pendingPushes.get(team));
    const timer = setTimeout(() => pushTeamState(team, reason), 800);
    pendingPushes.set(team, timer);
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
    logTeamActivity(team, { type: 'points', delta, total, reason: entry.reason });
    queueTeamPush(team, 'points');
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
    logTeamActivity(team, { type: 'points', delta: 0, total: SCORE_BASE, reason });
    queueTeamPush(team, 'points');
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
    logTeamActivity(team, {
      type: 'progress',
      puzzle,
      status: value ? 'complete' : 'reset',
      detail: value ? 'Marked complete via admin' : 'Reopened via admin'
    });
    queueTeamPush(team, 'progress');
    announce(`${team.toUpperCase()} ${value ? 'completed' : 'reopened'} ${PUZZLE_LABELS[puzzle] || puzzle}.`);
    refreshAll();
  }

  let teamRows = [];
  let activePointsTeam = null;
  let pointsModalChart = null;
  let chartsAnimated = false;
  let forceChartAnimation = false;

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
      const issues = [];
      const progress = normalizeProgress(getJSON(`${team}_progress`, DEFAULT_PROGRESS), issues);
      setJSON(`${team}_progress`, progress);

      const progressMeta = normalizeProgressMeta(getJSON(`${team}_progress_meta`, {}), issues);
      setJSON(`${team}_progress_meta`, progressMeta);

      const times = normalizeTimes(getJSON(`${team}_times`, []), issues);
      setJSON(`${team}_times`, times);

      const score = normalizeScore(localStorage.getItem(scoreKey(team)), issues);
      localStorage.setItem(scoreKey(team), String(score));

      const scoreLog = normalizeScoreLog(readScoreLog(team), issues, score);
      localStorage.setItem(scoreLogKey(team), JSON.stringify(scoreLog));

      const activity = normalizeActivity(getJSON(activityKey(team), []), issues);
      setJSON(activityKey(team), activity);

      const vault = readVault(team);
      const sessionEvents = activity.filter(entry => entry.type === 'session');
      const lastSession = sessionEvents.length ? sessionEvents[sessionEvents.length - 1] : null;
      const sessionActive = lastSession?.status === 'login';
      const lastEvent = activity.length ? activity[activity.length - 1] : null;

      const completed = PUZZLES.reduce((acc, p) => acc + (progress[p] ? 1 : 0), 0);
      const avgTime = average(times);
      const totalTime = times.reduce((a, b) => a + b, 0);
      const progressPercent = Math.round((completed / PUZZLES.length) * 100);
      const lastProgressAt = Object.values(progressMeta || {}).reduce((max, entry) => {
        const ts = Number(entry?.updatedAt) || 0;
        return ts > max ? ts : max;
      }, 0);
      const lastActivityAt = activity.reduce((max, entry) => {
        const ts = Number(entry?.at) || 0;
        return ts > max ? ts : max;
      }, 0);
      const lastMovement = Math.max(lastProgressAt, lastActivityAt, scoreLog[scoreLog.length - 1]?.at || 0);
      const isStalled = completed < PUZZLES.length && lastProgressAt > 0 && Date.now() - lastProgressAt > STALLED_MS;

      rows.push({
        team,
        progress,
        progressMeta,
        times,
        completed,
        avgTime,
        totalTime,
        score,
        scoreLog,
        activity,
        progressPercent,
        lastLog: scoreLog[scoreLog.length - 1] || null,
        lastProgressAt,
        lastActivityAt,
        lastMovement,
        stalled: isStalled,
        issues,
        vault,
        session: {
          active: sessionActive,
          lastSession,
          lastEvent
        }
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
      const { team, progress, completed, avgTime, totalTime, score, progressPercent, lastLog, issues, session } = row;
      const puzzleCount = PUZZLES.length;
      const percent = Math.max(0, Math.min(100, Number(progressPercent) || 0));

      const card = document.createElement('article');
      card.className = 'team-card';
      card.dataset.team = team;
      if (issues?.length) card.classList.add('has-issues');
      if (session?.active) card.classList.add('is-live');
      if (issues?.length) card.classList.add('has-issues');

      // Header with team name + points / action
      const header = document.createElement('div');
      header.className = 'team-card__header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'team-card__title';

      const h3 = document.createElement('h3');
      h3.textContent = team.toUpperCase();

      const subtitle = document.createElement('small');
      subtitle.textContent = `${completed}/${puzzleCount} puzzles${session?.active ? ' • online' : ''}`;

      titleWrap.append(h3, subtitle);
      if (row.stalled) {
        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'team-card__badges-inline';
        const stalledTag = document.createElement('span');
        stalledTag.className = 'team-card__status is-stalled';
        stalledTag.textContent = 'Needs nudge';
        badgeWrap.appendChild(stalledTag);
        titleWrap.appendChild(badgeWrap);
      }

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

      const activitySpan = document.createElement('span');
      activitySpan.innerHTML = `Last activity <strong>${timeAgo(row.lastMovement)}</strong>`;

      meta.append(avgSpan, totalSpan, lastSpan, activitySpan);
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

      if (session?.lastEvent) {
        const statusRow = document.createElement('div');
        statusRow.className = 'team-card__session';
        const statusLabel = session.active ? 'Active now' : 'Last seen';
        statusRow.innerHTML = `<span>${statusLabel}</span><span>${timeAgo(session.lastSession?.at || session.lastEvent.at)}</span><span>${describeActivity(session.lastEvent)}</span>`;
        card.appendChild(statusRow);
      }

      if (issues?.length) {
        const warn = document.createElement('p');
        warn.className = 'team-card__issues';
        warn.textContent = `Data checks: ${issues.join('; ')}`;
        card.appendChild(warn);
      }

      listEl.appendChild(card);
    });
  }

  function describeActivity(entry) {
    if (!entry) return 'Updated';
    if (entry.type === 'progress') {
      const label = PUZZLE_LABELS[entry.puzzle] || (entry.puzzle || '').toUpperCase();
      return `${label}: ${entry.status === 'complete' ? 'Completed' : 'Reset'}`;
    }
    if (entry.type === 'points') {
      const delta = Number(entry.delta) || 0;
      const sign = delta >= 0 ? '+' : '−';
      const amount = Math.abs(delta);
      return `${sign}${amount} pts — ${entry.reason || 'Score change'}`;
    }
    return entry.detail || entry.reason || 'Updated';
  }

  function renderActivityFeed(rows) {
    const container = qs('#recentActivityList');
    if (!container) return;
    const events = [];
    rows.forEach(row => {
      (row.activity || []).forEach(entry => {
        events.push({ ...entry, team: row.team });
      });
    });
    events.sort((a, b) => (b.at || 0) - (a.at || 0));
    const filtered = events.filter(event => {
      if (activityFilter.team !== 'all' && event.team !== activityFilter.team) return false;
      if (activityFilter.type !== 'all' && event.type !== activityFilter.type) return false;
      return true;
    }).slice(0, 40);

    container.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No recent activity for this filter.';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'activity-list';

    filtered.forEach(event => {
      const li = document.createElement('li');
      li.className = 'activity-list__item';
      const summary = describeActivity(event);
      li.innerHTML = `
        <span class="activity-list__time">${timeAgo(event.at)}</span>
        <span class="activity-list__team">${event.team.toUpperCase()}</span>
        <span class="activity-list__summary">${summary}</span>
      `;
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  function initActivityFilters() {
    if (activityFiltersReady) return;
    const teamSelect = qs('#activityTeamFilter');
    if (teamSelect) {
      teamSelect.innerHTML = '<option value="all">All teams</option>' + TEAMS.map(t => `<option value="${t}">${t.toUpperCase()}</option>`).join('');
      teamSelect.value = activityFilter.team;
      teamSelect.addEventListener('change', () => {
        activityFilter.team = teamSelect.value;
        renderActivityFeed(teamRows);
      });
    }
    const typeSelect = qs('#activityTypeFilter');
    if (typeSelect) {
      const typeOptions = [
        { value: 'all', label: 'All events' },
        { value: 'progress', label: 'Progress only' },
        { value: 'points', label: 'Points only' }
      ];
      typeSelect.innerHTML = typeOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      typeSelect.value = activityFilter.type;
      typeSelect.addEventListener('change', () => {
        activityFilter.type = typeSelect.value;
        renderActivityFeed(teamRows);
      });
    }
    activityFiltersReady = true;
  }

  function renderSessionList(rows) {
    const list = qs('#sessionList');
    if (!list) return;
    list.innerHTML = '';
    const sorted = rows.slice().sort((a, b) => {
      const aActive = a.session?.active ? 1 : 0;
      const bActive = b.session?.active ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      const aAt = a.session?.lastSession?.at || a.session?.lastEvent?.at || 0;
      const bAt = b.session?.lastSession?.at || b.session?.lastEvent?.at || 0;
      return bAt - aAt;
    });

    sorted.forEach(row => {
      const li = document.createElement('li');
      li.className = `session-list__item ${row.session?.active ? 'is-online' : 'is-offline'}`;
      const name = document.createElement('strong');
      name.textContent = row.team.toUpperCase();

      const status = document.createElement('span');
      status.className = 'session-list__status';
      status.textContent = row.session?.active ? 'Online' : 'Offline';

      const time = document.createElement('span');
      time.className = 'session-list__time';
      const refTs = row.session?.lastSession?.at || row.session?.lastEvent?.at;
      time.textContent = refTs ? timeAgo(refTs) : '—';

      const detail = document.createElement('span');
      detail.className = 'session-list__detail';
      detail.textContent = row.session?.lastEvent ? describeActivity(row.session.lastEvent) : 'No activity recorded.';

      li.append(name, status, time, detail);
      list.appendChild(li);
    });
  }

  function renderLockDigits() {
    const lockEl = qs('#lockHow');
    if (!lockEl) return;
    lockEl.textContent = 'Vault digits hidden in admin view. Switch to a team session to see their progress.';
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

  let progressChart, timeChart, challengeChart;

  function drawCharts(rows) {
    const labels = rows.map(r => r.team.toUpperCase());
    const completedData = rows.map(r => r.completed);
    const avgTimeData = rows.map(r => r.avgTime ?? 0);
    const challengeData = PUZZLES.map(puzzle => rows.reduce((acc, row) => acc + (row.progress?.[puzzle] ? 1 : 0), 0));
    const animate = forceChartAnimation || !chartsAnimated;
    const commonAnimation = animate ? { duration: 650, easing: 'easeOutCubic' } : false;

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
          animation: commonAnimation,
          scales: { y: { beginAtZero: true, max: PUZZLES.length, ticks: { stepSize: 1 } } },
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
          animation: commonAnimation,
          scales: { y: { beginAtZero: true } },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false }
          },
          layout: { padding: 6 }
        }
      });
    }

    const challengeCtx = qs('#challengeChart')?.getContext('2d');
    if (challengeCtx) {
      if (challengeChart) challengeChart.destroy();
      challengeChart = new Chart(challengeCtx, {
        type: 'bar',
        data: {
          labels: PUZZLES.map(puzzle => PUZZLE_LABELS[puzzle] || puzzle),
          datasets: [
            {
              label: 'Teams completed',
              data: challengeData,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: commonAnimation,
          scales: { y: { beginAtZero: true, max: Math.max(1, rows.length), ticks: { stepSize: 1 } } },
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: false }
          },
          layout: { padding: 6 }
        }
      });
    }

    if (animate) chartsAnimated = true;
    forceChartAnimation = false;
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
    qs('#resetAllProgress')?.addEventListener('click', async () => {
      if (!confirm('Reset progress, points, and times for every team?')) return;
      const status = qs('#syncStatus');
      if (status) {
        status.textContent = 'Resetting all teams…';
        status.classList.remove('status-ok', 'status-warn');
      }
      const resetVersion = Date.now();
      TEAMS.forEach(team => {
        setJSON(`${team}_progress`, { ...DEFAULT_PROGRESS });
        setJSON(`${team}_progress_meta`, {});
        setJSON(`${team}_times`, []);
        setJSON(activityKey(team), []);
        logTeamActivity(team, { type: 'session', status: 'reset', detail: 'Progress reset by admin', at: resetVersion });
        writeVault(team, { resetVersion });
        resetTeamScore(team, 'Reset via admin');
      });
      ['lock_digit_phishing_total',
       'lock_digit_caesar_shift',
       'lock_digit_pw_clues',
       'lock_digit_pw_minutes',
       'lock_digit_essential',
       'lock_digit_binary'
      ].forEach(key => localStorage.removeItem(key));
      try {
        const payload = TEAMS.map(getTeamStateSnapshot);
        await fetch('/.netlify/functions/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams: payload })
        });
        if (status) {
          status.textContent = 'All teams reset.';
          status.classList.add('status-ok');
        }
        noteSync('Reset', 'All teams reset and synced.');
      } catch (err) {
        if (status) {
          status.textContent = `Reset sync failed: ${err.message}`;
          status.classList.add('status-warn');
        }
        noteSync('Reset', err.message, 'warn');
      }
      announce('All team progress reset.');
      renderLockDigits();
      refresh();
    });

    // Confetti / Spotlight overlays (simple class toggles)
    const confettiLayer = qs('#confettiLayer');
    const spotlightLayer = qs('#spotlightLayer');

    const hideCelebrate = () => {
      if (!confettiLayer) return;
      confettiLayer.classList.remove('is-active', 'podium-visible');
      confettiLayer.setAttribute('aria-hidden', 'true');
    };

    const showCelebrate = (withPodium = false) => {
      if (!confettiLayer) return;
      const rows = loadTeamData();
      teamRows = rows;
      renderPodium(rows);
      confettiLayer.classList.add('is-active');
      confettiLayer.classList.toggle('podium-visible', withPodium);
      confettiLayer.setAttribute('aria-hidden', 'false');
    };

    qs('#celebrateClose')?.addEventListener('click', hideCelebrate);

    qs('#triggerConfetti')?.addEventListener('click', () => {
      showCelebrate(false);
      announce('Celebration!');
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
        showCelebrate(true);
      } else {
        hideCelebrate();
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
      if (window.utils?.logout) {
        window.utils.logout('index.html');
      } else {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
      }
    };

    // Neon sync hooks (optional Netlify Functions)
    qs('#pullNeonBtn')?.addEventListener('click', async () => {
      const status = qs('#syncStatus');
      try {
        forceChartAnimation = true;
        await syncFromNeon(status);
        refresh();
      } catch (_) {
        refresh();
      }
    });

    qs('#pushNeonBtn')?.addEventListener('click', async () => {
      const status = qs('#syncStatus');
      try {
        if (status) {
          status.textContent = 'Pushing to Neon…';
          status.classList.remove('status-ok', 'status-warn');
        }
        const payload = TEAMS.map(getTeamStateSnapshot);
        const res = await fetch('/.netlify/functions/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams: payload })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json().catch(() => ({ ok: true }));
        if (status) {
          status.textContent = 'Push complete.';
          status.classList.add('status-ok');
        }
        announce('Pushed stats to Neon.');
        noteSync('Push', body?.updated ? `Synced ${body.updated} teams to Neon.` : 'Push complete.');
      } catch (e) {
        if (status) {
          status.textContent = `Push failed: ${e.message}`;
          status.classList.add('status-warn');
        }
        noteSync('Push', e.message, 'warn');
      }
    });

    qs('#validateDataBtn')?.addEventListener('click', () => {
      const problems = teamRows.flatMap(row => (row.issues || []).map(issue => `${row.team}: ${issue}`));
      if (!problems.length) {
        noteSync('Validation', 'No data issues detected.', 'info');
      } else {
        noteSync('Validation', `${problems.length} data issue(s) flagged. See highlighted team cards.`, 'warn');
        if (typeof console !== 'undefined') {
          const payload = problems.map(text => ({ issue: text }));
          if (typeof console.table === 'function') console.table(payload);
          else console.log(payload);
        }
      }
    });

    qs('#downloadStateBtn')?.addEventListener('click', () => {
      const snapshot = JSON.stringify(teamRows, null, 2);
      const blob = new Blob([snapshot], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `team-state-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      noteSync('Snapshot', 'Downloaded current team state as JSON.');
    });
  }

  async function syncFromNeon(statusEl) {
    try {
      if (statusEl) {
        statusEl.textContent = 'Pulling from Neon…';
        statusEl.classList.remove('status-ok', 'status-warn');
      }
      const res = await fetch('/.netlify/functions/pull', { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.teams)) {
        throw new Error('No teams returned');
      }
      const corrections = [];
      data.teams.forEach(row => {
        if (!row || !row.team) return;
        const team = String(row.team).toLowerCase();
        const issues = [];
        const progress = normalizeProgress(row.progress, issues);
        setJSON(`${team}_progress`, progress);
        const progressMeta = normalizeProgressMeta(row.progressMeta, issues);
        setJSON(`${team}_progress_meta`, progressMeta);
        const times = normalizeTimes(row.times, issues);
        setJSON(`${team}_times`, times);
        const score = normalizeScore(row.score, issues);
        localStorage.setItem(scoreKey(team), String(score));
        const scoreLog = normalizeScoreLog(row.scoreLog, issues, score);
        localStorage.setItem(scoreLogKey(team), JSON.stringify(scoreLog));
        const activity = normalizeActivity(row.activity, issues);
        setJSON(activityKey(team), activity);
        writeVault(team, row.vault || {});
        if (issues.length) corrections.push({ team, issues });
      });
      if (statusEl) {
        statusEl.textContent = 'Pulled latest stats from Neon.';
        statusEl.classList.add('status-ok');
      }
      noteSync('Pull', `Pulled ${data.teams.length} team states${corrections.length ? `; ${corrections.length} cleaned` : ''}.`);
      return { teams: data.teams, corrections };
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = `Pull failed: ${e.message}`;
        statusEl.classList.add('status-warn');
      }
      console.error('Neon sync failed:', e);
      noteSync('Pull', e.message, 'warn');
      throw e;
    }
  }

  // ---------- Boot ---------------------------------------------------------

  function refreshAll() {
    const rows = loadTeamData();
    teamRows = rows;
    renderLockDigits();
    renderTeamCards(rows);
    renderStats(rows);
    drawCharts(rows);
    initActivityFilters();
    renderActivityFeed(rows);
    renderSessionList(rows);
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
    syncFromNeon().then(() => refreshAll()).catch(() => refreshAll());
    wireChartTabs();
    wireControls(refreshAll);
    const throttledRefresh = window.utils?.throttle ? window.utils.throttle(refreshAll, 300) : refreshAll;
    window.addEventListener('storage', throttledRefresh);
    setInterval(() => {
      syncFromNeon().then(() => refreshAll()).catch((err) => noteSync('Auto pull', err.message, 'warn'));
    }, 25000);
  });

})();
