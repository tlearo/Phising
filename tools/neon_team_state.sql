-- Neon/Postgres schema for Cyber Escape Rooms persistent state
-- Run once to provision the consolidated team_state table plus supporting indexes.

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
);

alter table team_state
  add column if not exists vault jsonb not null default '{}'::jsonb;

alter table team_state
  alter column progress set default '{}'::jsonb,
  alter column progress_meta set default '{}'::jsonb,
  alter column times set default '[]'::jsonb,
  alter column score set default 100,
  alter column score_log set default '[]'::jsonb,
  alter column activity set default '[]'::jsonb,
  alter column updated_at set default now();

-- Helpful indexes for admin reporting / troubleshooting
create index if not exists team_state_updated_idx on team_state (updated_at desc);
create index if not exists team_state_progress_gin on team_state using gin (progress);
create index if not exists team_state_activity_gin on team_state using gin (activity);
create index if not exists team_state_score_idx on team_state (score);

-- The `vault` column also stores misc metadata (e.g., resetVersion timestamps).

-- Optional legacy snapshot tables (only if you still rely on them)
-- create table progress (...);
-- create table times (...);
