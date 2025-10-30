import { createClient, ensureTeamStateTable, DEFAULT_PROGRESS, errorResponse } from './_shared/db.js';

function normalizeProgress(raw) {
  const cleaned = { ...DEFAULT_PROGRESS };
  Object.keys(DEFAULT_PROGRESS).forEach(key => {
    cleaned[key] = !!raw?.[key];
  });
  return cleaned;
}

function normalizeProgressMeta(raw) {
  const meta = {};
  if (!raw || typeof raw !== 'object') return meta;
  Object.entries(raw).forEach(([key, value]) => {
    const percent = Math.max(0, Math.min(100, Math.round(Number(value?.percent ?? value ?? 0))));
    const updatedAt = Number(value?.updatedAt ?? Date.now());
    meta[key] = {
      percent: Number.isFinite(percent) ? percent : 0,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    };
  });
  return meta;
}

function normalizeTimes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);
}

function normalizeScore(raw) {
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 100;
}

function normalizeScoreLog(raw, fallbackTotal) {
  if (!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    delta: Number.isFinite(entry?.delta) ? Math.round(entry.delta) : 0,
    total: Number.isFinite(entry?.total) ? Math.max(0, Math.round(entry.total)) : fallbackTotal,
    reason: entry?.reason || 'update',
    at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
  }));
}

function normalizeActivity(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    type: entry?.type || 'event',
    detail: entry?.detail || '',
    puzzle: entry?.puzzle || null,
    status: entry?.status || null,
    delta: Number.isFinite(entry?.delta) ? Number(entry.delta) : null,
    total: Number.isFinite(entry?.total) ? Number(entry.total) : null,
    reason: entry?.reason || null,
    at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
  }));
}

const respond = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

function sanitizePayload(body = {}) {
  const progress = normalizeProgress(body.progress);
  const progressMeta = normalizeProgressMeta(body.progressMeta);
  const times = normalizeTimes(body.times);
  const score = normalizeScore(body.score);
  const scoreLog = normalizeScoreLog(body.scoreLog, score);
  const activity = normalizeActivity(body.activity);
  const vault = body.vault && typeof body.vault === 'object' ? body.vault : {};
  return { progress, progress_meta: progressMeta, times, score, score_log: scoreLog, activity, vault };
}

function normalizeState(row) {
  if (!row) return null;
  const sanitized = sanitizePayload({
    progress: row.progress,
    progressMeta: row.progress_meta,
    times: row.times,
    score: row.score,
    scoreLog: row.score_log,
    activity: row.activity,
    vault: row.vault
  });
  return {
    team: row.team,
    progress: sanitized.progress,
    progressMeta: sanitized.progress_meta,
    times: sanitized.times,
    score: sanitized.score,
    scoreLog: sanitized.score_log,
    activity: sanitized.activity,
    vault: sanitized.vault,
    updatedAt: row.updated_at || null
  };
}

export default async (req) => {
  let client;
  try {
    client = createClient();
    await client.connect();
    await ensureTeamStateTable(client);
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const team = url.searchParams.get('team');
      if (!team) return respond(400, { ok: false, error: 'Missing team parameter' });
      const teamKey = team.trim().toLowerCase();
      if (!teamKey) return respond(400, { ok: false, error: 'Invalid team parameter' });
      const { rows } = await client.query('select * from team_state where team = $1 limit 1', [teamKey]);
      if (rows.length) {
        return respond(200, { ok: true, state: normalizeState(rows[0]) });
      }
      const defaults = sanitizePayload({});
      await client.query(
        `insert into team_state (team, progress, progress_meta, times, score, score_log, activity, vault, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, now())`,
        [teamKey, defaults.progress, defaults.progress_meta, defaults.times, defaults.score, defaults.score_log, defaults.activity, defaults.vault]
      );
      return respond(200, { ok: true, state: normalizeState({ team: teamKey, ...defaults }) });
    }

    if (req.method === 'PUT') {
      const body = await req.json().catch((err) => {
        console.error('[team-state] invalid JSON body', err);
        return null;
      });
      if (!body || typeof body !== 'object') {
        return respond(400, { ok: false, error: 'Invalid JSON payload' });
      }
      const team = String(body.team || '').trim().toLowerCase();
      if (!team) return respond(400, { ok: false, error: 'Missing team' });
      const sanitized = sanitizePayload(body);
      await client.query(
        `insert into team_state (team, progress, progress_meta, times, score, score_log, activity, vault, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, now())
         on conflict (team) do update set
           progress = excluded.progress,
           progress_meta = excluded.progress_meta,
           times = excluded.times,
           score = excluded.score,
           score_log = excluded.score_log,
           activity = excluded.activity,
           vault = excluded.vault,
           updated_at = now()`,
        [team, sanitized.progress, sanitized.progress_meta, sanitized.times, sanitized.score, sanitized.score_log, sanitized.activity, sanitized.vault]
      );
      return respond(200, { ok: true });
    }

    return respond(405, { ok: false, error: 'Method Not Allowed' });
  } catch (e) {
    console.error('[team-state] request failed', e);
    return respond(500, { ok: false, error: e.message || 'Team state failure' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
