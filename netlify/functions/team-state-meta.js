import { createClient, ensureTeamStateTable, errorResponse } from './_shared/db.js';

export default async (req) => {
  if (req.method !== 'GET') return errorResponse(405, { ok: false, error: 'Method Not Allowed' });
  const team = new URL(req.url).searchParams.get('team');
  if (!team) return errorResponse(400, { ok: false, error: 'Missing team' });

  let client;
  try {
    client = createClient();
    await client.connect();
    await ensureTeamStateTable(client);
    const { rows } = await client.query(
      'select progress_meta, progress from team_state where team = $1 limit 1',
      [team.trim().toLowerCase()]
    );
    if (!rows.length) {
      return errorResponse(404, { ok: false, error: 'Team not found' });
    }

    const row = rows[0] || {};
    const meta = row.progress_meta || {};
    const progress = row.progress || {};
    const response = {};
    Object.entries(meta).forEach(([key, value]) => {
      const percent = Number(value?.percent);
      if (Number.isFinite(percent)) {
        response[key] = Math.max(0, Math.min(100, Math.round(percent)));
      }
    });
    Object.entries(progress).forEach(([key, flag]) => {
      if (flag && typeof response[key] !== 'number') {
        response[key] = 100;
      }
    });

    return new Response(JSON.stringify({ ok: true, meta: response }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    console.error('[team-state-meta] failed', e);
    return errorResponse(500, { ok: false, error: e.message || 'Failed to load meta' });
  } finally {
    if (client) {
      try { await client.end(); } catch (_) {}
    }
  }
};
