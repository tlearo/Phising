// netlify/functions/seed-admin.js
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

export default async (req) => {
  // Gate with a one-time token in a header
  const token = req.headers.get('x-seed-token') || '';
  if (!process.env.ADMIN_SEED_TOKEN || token !== process.env.ADMIN_SEED_TOKEN) {
    return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  }

  const url = process.env.NEON_DATABASE_URL;
  const plain = process.env.ADMIN_SEED_PASSWORD;
  if (!url)  return Response.json({ ok:false, error:'NEON_DATABASE_URL not set' }, { status:500 });
  if (!plain) return Response.json({ ok:false, error:'ADMIN_SEED_PASSWORD not set' }, { status:500 });

  const client = new Client({ connectionString: url }); // ensure ?sslmode=require in the URL
  await client.connect();
  try {
    await client.query(`
      create table if not exists users (
        username text primary key,
        role text not null,
        password_hash text not null
      )
    `);

    // Optional: refuse if admin already exists (prevents reuse)
    const existing = await client.query('select 1 from users where username=$1', ['admin']);
    if (existing.rowCount) {
      return Response.json({ ok:false, error:'admin already exists; refusing to overwrite' }, { status:409 });
    }

    const hash = await bcrypt.hash(plain, 12);
    await client.query(
      `insert into users (username, role, password_hash)
       values ($1, 'admin', $2)
       on conflict (username) do update set password_hash = excluded.password_hash`,
      ['admin', hash]
    );

    return Response.json({ ok:true, user:'admin', note:'Remove this function and clear env vars after seeding' });
  } catch (e) {
    return Response.json({ ok:false, error:e.message }, { status:500 });
  } finally {
    await client.end();
  }
};

export const config = { path: "/.netlify/functions/seed-admin" };
