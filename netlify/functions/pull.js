import { createClient, ensureTeamStateTable, DEFAULT_PROGRESS, errorResponse } from './_shared/db.js';

function normalizeRow(row) {
  return {
    team: row.team,
    progress: { ...DEFAULT_PROGRESS, ...(row.progress || {}) },
    progressMeta: row.progress_meta || {},
    times: Array.isArray(row.times) ? row.times : [],
    score: Number.isFinite(row.score) ? row.score : 100,
    scoreLog: Array.isArray(row.score_log) ? row.score_log : [],
    activity: Array.isArray(row.activity) ? row.activity : [],
    endless: Array.isArray(row.endless) ? row.endless : [],
    bonus: row.bonus && typeof row.bonus === 'object' ? row.bonus : {},
    vault: row.vault || {},
    updatedAt: row.updated_at || null
  };
}

async function legacySnapshot(client) {
  try {
    const prog = await client.query('select team, phishing, password, encryption, essential from progress order by team asc');
    const times = await client.query('select team, avg_seconds from times');
    const timeMap = new Map(times.rows.map(r => [r.team, r.avg_seconds]));
    return prog.rows.map(r => normalizeRow({
      team: r.team,
      progress: {
        phishing: !!r.phishing,
        password: !!r.password,
        encryption: !!r.encryption,
        essential: !!r.essential,
        binary: false
      },
      times: timeMap.has(r.team) && timeMap.get(r.team) != null ? [Number(timeMap.get(r.team))] : [],
      score: 100,
      score_log: []
    }));
  } catch {
    return [];
  }
}

export default async (req) => {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  let client;
  try {
    client = createClient();
    await client.connect();
    await ensureTeamStateTable(client);
    const { rows } = await client.query('select team, progress, progress_meta, times, score, score_log, activity, endless, bonus, vault, updated_at from team_state order by team asc');
    const teams = rows.length ? rows.map(normalizeRow) : await legacySnapshot(client);
    return Response.json({ ok: true, teams });
  } catch (e) {
    console.error('[pull] failed to fetch team states', e);
    return errorResponse(500, { ok: false, error: e.message || 'Pull failed' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
