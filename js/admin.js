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

  const PUZZLES = ['phishing', 'password', 'encryption', 'essential'];

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
        essential: false
      });

      const times = getJSON(`${team}_times`, []); // array of seconds per puzzle (optional)

      const completed = PUZZLES.reduce((acc, p) => acc + (progress[p] ? 1 : 0), 0);
      const avgTime = average(times);

      rows.push({ team, progress, times, completed, avgTime });
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

    rows.forEach(({ team, progress, completed, avgTime }) => {
      const card = document.createElement('div');
      card.className = 'team-card';

      // Title
      const h3 = document.createElement('h3');
      h3.textContent = team.toUpperCase();
      card.appendChild(h3);

      // Badges for each puzzle
      const badges = document.createElement('div');
      badges.className = 'puzzle-badges';

      PUZZLES.forEach(p => {
        const b = document.createElement('span');
        b.className = `badge ${progress[p] ? 'ok' : 'dim'}`;
        b.textContent = p.charAt(0).toUpperCase() + p.slice(1);
        badges.appendChild(b);
      });

      card.appendChild(badges);

      // Stats row
      const meta = document.createElement('p');
      meta.className = 'muted mt-1';
      meta.innerHTML = `Puzzles: <strong>${completed}/4</strong> &nbsp;•&nbsp; Avg Time: <strong>${fmtSecs(avgTime)}</strong>`;
      card.appendChild(meta);

      listEl.appendChild(card);
    });
  }

  function renderStats(rows) {
    const statsEl = qs('#averageTimeStats');
    const statTotalTeams = qs('#statTotalTeams');
    const statTotalCompleted = qs('#statTotalCompleted');
    const statAvgTime = qs('#statAvgTime');

    const totalTeams = rows.length;
    const totalCompleted = rows.reduce((a, r) => a + r.completed, 0);
    const overallAvg = average(rows.map(r => r.avgTime).filter(Boolean));

    if (statsEl) {
      statsEl.textContent = `Teams: ${totalTeams} • Avg puzzles completed/team: ${(totalCompleted / totalTeams).toFixed(2)} • Overall avg time: ${fmtSecs(overallAvg)}`;
    }
    if (statTotalTeams) statTotalTeams.textContent = String(totalTeams);
    if (statTotalCompleted) statTotalCompleted.textContent = String(totalCompleted);
    if (statAvgTime) statAvgTime.textContent = fmtSecs(overallAvg);
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

  function wireControls(refresh) {
    // Reset all local team progress/times
    qs('#resetAllProgress')?.addEventListener('click', () => {
      if (!confirm('Reset progress and times for all teams?')) return;
      TEAMS.forEach(t => {
        localStorage.removeItem(`${t}_progress`);
        localStorage.removeItem(`${t}_times`);
      });
      announce('All team progress reset.');
      refresh();
    });

    // Confetti / Spotlight overlays (simple class toggles)
    const confettiLayer = qs('#confettiLayer');
    const spotlightLayer = qs('#spotlightLayer');

    qs('#triggerConfetti')?.addEventListener('click', () => {
      if (!confettiLayer) return;
      confettiLayer.classList.remove('hidden');
      confettiLayer.classList.add('show');
      announce('Celebration!');
      // Auto hide after a few seconds (CSS handles animation if present)
      setTimeout(() => confettiLayer.classList.add('hidden'), 3000);
    });

    qs('#toggleSpotlight')?.addEventListener('click', () => {
      if (!spotlightLayer) return;
      spotlightLayer.classList.toggle('hidden');
      announce('Spotlight toggled');
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
        status && (status.textContent = 'Pulling from Neon…');
        const res = await fetch('/.netlify/functions/pull', { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json(); // expected: { teams: [{team, progress, times}] }
        if (Array.isArray(data.teams)) {
          data.teams.forEach(row => {
            if (!row || !row.team) return;
            if (row.progress) setJSON(`${row.team}_progress`, row.progress);
            if (row.times) setJSON(`${row.team}_times`, row.times);
          });
          status && (status.textContent = 'Pulled latest stats from Neon.');
          announce('Pulled latest stats from Neon.');
          refresh();
        } else {
          status && (status.textContent = 'No data returned.');
        }
      } catch (e) {
        status && (status.textContent = `Pull failed: ${e.message}`);
      }
    });

    qs('#pushNeonBtn')?.addEventListener('click', async () => {
      const status = qs('#syncStatus');
      try {
        status && (status.textContent = 'Pushing to Neon…');
        const teams = TEAMS.map(team => ({
          team,
          progress: getJSON(`${team}_progress`, {
            phishing: false, password: false, encryption: false, essential: false
          }),
          times: getJSON(`${team}_times`, [])
        }));
        const res = await fetch('/.netlify/functions/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        status && (status.textContent = 'Push complete.');
        announce('Pushed stats to Neon.');
      } catch (e) {
        status && (status.textContent = `Push failed: ${e.message}`);
      }
    });
  }

  // ---------- Boot ---------------------------------------------------------

  function refreshAll() {
    const rows = loadTeamData();
    renderTeamCards(rows);
    renderStats(rows);
    drawCharts(rows);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const user = guardAdmin();
    if (!user) return;

    renderWelcome(user);
    refreshAll();
    wireControls(refreshAll);
  });

})();
