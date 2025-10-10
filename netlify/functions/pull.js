import { Client } from 'pg';

export default async (req, context) => {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();
  try {
    const prog = await client.query('select team, phishing, password, encryption, essential from progress order by team asc');
    const times = await client.query('select team, avg_seconds from times');
    const timeMap = new Map(times.rows.map(r => [r.team, r.avg_seconds]));
    const teams = prog.rows.map(r => ({
      team: r.team,
      progress: {
        phishing: !!r.phishing,
        password: !!r.password,
        encryption: !!r.encryption,
        essential: !!r.essential
      },
      times: timeMap.has(r.team) && timeMap.get(r.team) != null ? [Number(timeMap.get(r.team))] : []
    }));
    return Response.json({ ok: true, teams });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    await client.end();
  }
};
