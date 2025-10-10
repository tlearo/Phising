import { Client } from 'pg';
import bcrypt from 'bcryptjs';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return Response.json({ ok: false, error: 'Missing credentials' }, { status: 400 });
  }

  const client = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(
      'select username, role, password_hash from users where lower(username)=lower($1) limit 1',
      [username]
    );
    if (!rows.length) {
      return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return Response.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }
    return Response.json({ ok: true, user: { username: u.username, role: u.role } });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  } finally {
    await client.end();
  }
};
