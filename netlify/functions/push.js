import { Client } from 'pg';

export default async (req, context) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await req.json().catch(() => ({}));
  const teams = Array.isArray(body.teams) ? body.teams : [];

  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();

  try {
    for (const t of teams) {
      const team = String(t.team).toLowerCase();
      if (!team) continue;

      // upsert progress
      await client.query(
        `insert into progress (team, phishing, password, encryption, essential)
         values ($1,$2,$3,$4,$5)
         on conflict (team) do update set
           phishing=excluded.phishing,
           password=excluded.password,
           encryption=excluded.encryption,
           essential=excluded.essential`,
        [
          team,
          !!t.progress?.phishing,
          !!t.progress?.password,
          !!t.progress?.encryption,
          !!t.progress?.essential
        ]
      );

      // Optional: store average time
      const timesArr = Array.isArray(t.times) ? t.times.filter(n => Number.isFinite(n)) : [];
      const avg = timesArr.length ? Math.round(timesArr.reduce((a,b)=>a+b,0)/timesArr.length) : null;

      await client.query(
        `insert into times (team, avg_seconds)
         values ($1,$2)
         on conflict (team) do update set avg_seconds = excluded.avg_seconds`,
        [team, avg]
      );
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    await client.end();
  }
};
