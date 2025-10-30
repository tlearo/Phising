import { createClient, ensureTeamStateTable, DEFAULT_PROGRESS, errorResponse } from './_shared/db.js';

function sanitizeRow(row = {}) {
  const progress = { ...DEFAULT_PROGRESS };
  Object.keys(DEFAULT_PROGRESS).forEach(key => {
    progress[key] = !!row?.progress?.[key];
  });

  const progressMeta = {};
  if (row.progressMeta && typeof row.progressMeta === 'object') {
    Object.entries(row.progressMeta).forEach(([key, value]) => {
      const percent = Math.max(0, Math.min(100, Math.round(Number(value?.percent ?? value ?? 0))));
      const updatedAt = Number(value?.updatedAt ?? Date.now());
      progressMeta[key] = {
        percent: Number.isFinite(percent) ? percent : 0,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
      };
    });
  }

  const times = Array.isArray(row.times)
    ? row.times.map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0)
    : [];

  const score = Number.isFinite(row.score) ? Math.max(0, Math.round(row.score)) : 100;

  const scoreLog = Array.isArray(row.scoreLog)
    ? row.scoreLog.map(entry => ({
        delta: Number.isFinite(entry?.delta) ? Math.round(entry.delta) : 0,
        total: Number.isFinite(entry?.total) ? Math.max(0, Math.round(entry.total)) : score,
        reason: entry?.reason || 'update',
        at: Number.isFinite(entry?.at) ? entry.at : Date.now()
      }))
    : [];

  const activity = Array.isArray(row.activity)
    ? row.activity.map(entry => ({
        type: entry?.type || 'event',
        detail: entry?.detail || '',
        puzzle: entry?.puzzle || null,
        status: entry?.status || null,
        delta: Number.isFinite(entry?.delta) ? Number(entry.delta) : null,
        total: Number.isFinite(entry?.total) ? Number(entry.total) : null,
        reason: entry?.reason || null,
        at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
      }))
    : [];

  const endless = Array.isArray(row.endless)
    ? row.endless.map(entry => ({
        name: String(entry?.name || 'Anonymous').slice(0, 80),
        score: Number.isFinite(entry?.score) ? Math.max(0, Math.round(entry.score)) : 0,
        level: Number.isFinite(entry?.level) ? Math.max(1, Math.round(entry.level)) : 1,
        at: Number.isFinite(entry?.at) ? Number(entry.at) : Date.now()
      }))
    : [];

  const vault = row.vault && typeof row.vault === 'object' ? row.vault : {};
  return { progress, progressMeta, times, score, scoreLog, activity, endless, vault };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await req.json().catch(() => ({}));
  const teams = Array.isArray(body.teams) ? body.teams : [];

  let client;
  try {
    client = createClient();
    await client.connect();
    await ensureTeamStateTable(client);
    for (const raw of teams) {
      const team = String(raw?.team || '').trim().toLowerCase();
      if (!team) continue;
      const sanitized = sanitizeRow(raw);
      await client.query(
        `insert into team_state (team, progress, progress_meta, times, score, score_log, activity, endless, vault, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         on conflict (team) do update set
           progress = excluded.progress,
           progress_meta = excluded.progress_meta,
           times = excluded.times,
           score = excluded.score,
           score_log = excluded.score_log,
           activity = excluded.activity,
           endless = excluded.endless,
           vault = excluded.vault,
           updated_at = now()`,
        [team, sanitized.progress, sanitized.progressMeta, sanitized.times, sanitized.score, sanitized.scoreLog, sanitized.activity, sanitized.endless, sanitized.vault]
      );
    }

    return Response.json({ ok: true, updated: teams.length });
  } catch (e) {
    console.error('[push] failed to sync teams', e);
    return errorResponse(500, { ok: false, error: e.message || 'Push failed' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
