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

function normalizeRow(row) {
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
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  try {
    await ensureTeamStateTable(client);
    const { rows } = await client.query('select team, progress, progress_meta, times, score, score_log, activity, vault, updated_at from team_state order by team asc');
    const teams = rows.length ? rows.map(normalizeRow) : await legacySnapshot(client);
    return Response.json({ ok: true, teams });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    await client.end();
  }
};
