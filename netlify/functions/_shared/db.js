import { Client } from 'pg';

export const DEFAULT_PROGRESS = {
  phishing: false,
  password: false,
  encryption: false,
  essential: false,
  binary: false
};

const DEFAULT_HEADERS = { 'content-type': 'application/json' };

export function errorResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: DEFAULT_HEADERS
  });
}

function normalizeConnectionString(raw) {
  if (!raw) return raw;
  let trimmed = raw.trim();
  if (trimmed.startsWith('psql ')) {
    trimmed = trimmed.slice(5).trim();
  }
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    trimmed = trimmed.slice(1, -1);
  }
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.searchParams.get('channel_binding') === 'require') {
      url.searchParams.set('channel_binding', 'prefer');
    }
    if (!url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function createClient() {
  const raw = process.env.NEON_DATABASE_URL;
  if (!raw) {
    throw new Error('NEON_DATABASE_URL is not configured');
  }

  const connectionString = normalizeConnectionString(raw);
  const config = { connectionString, ssl: { rejectUnauthorized: false } };
  return new Client(config);
}

export async function ensureTeamStateTable(client) {
  await client.query(`
    create table if not exists team_state (
      team text primary key,
      progress jsonb not null default '{}'::jsonb,
      progress_meta jsonb not null default '{}'::jsonb,
      times jsonb not null default '[]'::jsonb,
      score integer not null default 100,
      score_log jsonb not null default '[]'::jsonb,
      activity jsonb not null default '[]'::jsonb,
      endless jsonb not null default '[]'::jsonb,
      bonus jsonb not null default '{}'::jsonb,
      vault jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);

  await client.query(`alter table team_state add column if not exists endless jsonb not null default '[]'::jsonb`);
  await client.query(`alter table team_state add column if not exists bonus jsonb not null default '{}'::jsonb`);
  await client.query(`alter table team_state add column if not exists vault jsonb not null default '{}'::jsonb`);
}
