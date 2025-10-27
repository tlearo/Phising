import { Client } from 'pg';

const DEFAULT_PROGRESS = {
  phishing: false,
  password: false,
  encryption: false,
  essential: false,
  binary: false
};

async function ensureTeamStateTable(client) {
  await client.query(`
    create table if not exists team_state (
      team text primary key,
      progress jsonb not null default '{}'::jsonb,
      progress_meta jsonb not null default '{}'::jsonb,
      times jsonb not null default '[]'::jsonb,
      score integer not null default 100,
      score_log jsonb not null default '[]'::jsonb,
      activity jsonb not null default '[]'::jsonb,
      vault jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);
}

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function sanitizePayload(body = {}) {
  return {
    progress: { ...DEFAULT_PROGRESS, ...(body.progress || {}) },
    progress_meta: body.progressMeta && typeof body.progressMeta === 'object' ? body.progressMeta : {},
    times: Array.isArray(body.times) ? body.times.filter(n => Number.isFinite(n)) : [],
    score: Number.isFinite(body.score) ? Math.max(0, Math.round(body.score)) : 100,
    score_log: Array.isArray(body.scoreLog) ? body.scoreLog : [],
    activity: Array.isArray(body.activity) ? body.activity : [],
    vault: body.vault && typeof body.vault === 'object' ? body.vault : {}
  };
}

function normalizeState(row) {
  if (!row) return null;
  return {
    team: row.team,
    progress: { ...DEFAULT_PROGRESS, ...(row.progress || {}) },
    progressMeta: row.progress_meta || {},
    times: Array.isArray(row.times) ? row.times : [],
    score: Number.isFinite(row.score) ? row.score : 100,
    scoreLog: Array.isArray(row.score_log) ? row.score_log : [],
    activity: Array.isArray(row.activity) ? row.activity : [],
    vault: row.vault || {},
    updatedAt: row.updated_at || null
  };
}

export default async (req) => {
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  try {
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
      const body = await req.json().catch(() => ({}));
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
    return respond(500, { ok: false, error: e.message });
  } finally {
    await client.end();
  }
};
