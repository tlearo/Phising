document.addEventListener('DOMContentLoaded', () => {
    // ---- Auth guard (admins only) ------------------------------------------
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // ---- Elements -----------------------------------------------------------
    const welcomeEl = document.getElementById('adminWelcome');
    const listEl = document.getElementById('teamProgressList');
    const statsEl = document.getElementById('averageTimeStats');

    if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.username.toUpperCase()}!`;

    // ---- Teams we track -----------------------------------------------------
    const teams = ['team1', 'team2', 'team3', 'team4', 'team5'];

    // Ensure default keys exist so charts don’t break on first run
    teams.forEach((t) => {
        const progressKey = `${t}_progress`;
        const timesKey = `${t}_times`;

        if (!localStorage.getItem(progressKey)) {
            localStorage.setItem(progressKey, JSON.stringify({
                phishing: false, password: false, encryption: false, essential: false
            }));
        }
        if (!localStorage.getItem(timesKey)) {
            localStorage.setItem(timesKey, JSON.stringify([])); // seconds per puzzle attempt, etc.
        }
    });

    // ---- Aggregate data for UI & charts ------------------------------------
    const leaderboard = []; // {team, completed}
    const avgTimes = [];    // per team
    let totalCompleted = 0;
    let allTimesFlat = [];

    if (listEl) listEl.innerHTML = '';

    teams.forEach((team) => {
        const progress = JSON.parse(localStorage.getItem(`${team}_progress`)) || {
            phishing: false, password: false, encryption: false, essential: false
        };

        const times = JSON.parse(localStorage.getItem(`${team}_times`)) || []; // [56.2, 63.8, ...]
        const completed = Object.values(progress).filter(Boolean).length;
        const avgTime = times.length ? (times.reduce((a, b) => a + b, 0) / times.length) : 0;

        leaderboard.push({ team, completed });
        avgTimes.push(Number(avgTime.toFixed(1)));
        totalCompleted += completed;
        allTimesFlat = allTimesFlat.concat(times);

        // Leaderboard list item
        if (listEl) {
            const card = document.createElement('div');
            card.className = 'team-card';

            const nameEl = document.createElement('div');
            nameEl.className = 'team-name';
            nameEl.textContent = team.toUpperCase();

            const statsEl = document.createElement('div');
            statsEl.className = 'team-stats';
            statsEl.innerHTML = `
    <span><span class="team-stat-label">Puzzles:</span> ${completed}</span>
    <span><span class="team-stat-label">Avg Time:</span> ${avgTime ? avgTime.toFixed(1) + 's' : '—'}</span>
  `;

            card.appendChild(nameEl);
            card.appendChild(statsEl);
            listEl.appendChild(card);
        }

    });

    // Summary stats
    const teamsCount = teams.length;
    const avgCompletedPerTeam = (totalCompleted / teamsCount).toFixed(2);
    const overallAvgTime = allTimesFlat.length
        ? (allTimesFlat.reduce((a, b) => a + b, 0) / allTimesFlat.length).toFixed(1)
        : '—';

    if (statsEl) {
        statsEl.textContent =
            `Teams: ${teamsCount}  •  Avg puzzles completed/team: ${avgCompletedPerTeam}  •  Overall avg time: ${overallAvgTime}s`;
    }

    // ---- Charts -------------------------------------------------------------
    const labels = leaderboard.map(e => e.team.toUpperCase());
    const completions = leaderboard.map(e => e.completed);

    if (window.Chart) {
        // Progress chart (bar)
        const progressCtx = document.getElementById('progressChart');
        if (progressCtx) {
            new Chart(progressCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Puzzles Completed',
                        data: completions,
                        backgroundColor: '#58a6ff'
                    }]
                },
                options: {
                    responsive: true,
                    legend: { display: false },
                    scales: {
                        yAxes: [{ ticks: { beginAtZero: true, precision: 0, stepSize: 1 } }]
                    },
                    layout: { padding: { left: 6, right: 6, top: 6, bottom: 6 } }
                }
            });
        }

        // Avg time chart (bar)
        const timeCtx = document.getElementById('timeChart');
        if (timeCtx) {
            new Chart(timeCtx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Avg Completion Time (s)',
                        data: avgTimes,
                        backgroundColor: '#ffa65c'
                    }]
                },
                options: {
                    responsive: true,
                    legend: { display: false },
                    scales: {
                        yAxes: [{ ticks: { beginAtZero: true } }]
                    },
                    layout: { padding: { left: 6, right: 6, top: 6, bottom: 6 } }
                }
            });
        }
    }
});

// ---- Actions ---------------------------------------------------------------
function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}
