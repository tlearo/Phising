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

function sanitizeRow(row = {}) {
  const progress = { ...DEFAULT_PROGRESS, ...(row.progress || {}) };
  const progressMeta = row.progressMeta && typeof row.progressMeta === 'object' ? row.progressMeta : {};
  const times = Array.isArray(row.times) ? row.times.filter(n => Number.isFinite(n)) : [];
  const score = Number.isFinite(row.score) ? Math.max(0, Math.round(row.score)) : 100;
  const scoreLog = Array.isArray(row.scoreLog) ? row.scoreLog : [];
  const activity = Array.isArray(row.activity) ? row.activity : [];
  const vault = row.vault && typeof row.vault === 'object' ? row.vault : {};
  return { progress, progressMeta, times, score, scoreLog, activity, vault };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await req.json().catch(() => ({}));
  const teams = Array.isArray(body.teams) ? body.teams : [];

  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();

  try {
    await ensureTeamStateTable(client);
    for (const raw of teams) {
      const team = String(raw?.team || '').trim().toLowerCase();
      if (!team) continue;
      const sanitized = sanitizeRow(raw);
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
        [team, sanitized.progress, sanitized.progressMeta, sanitized.times, sanitized.score, sanitized.scoreLog, sanitized.activity, sanitized.vault]
      );
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    await client.end();
  }
};
