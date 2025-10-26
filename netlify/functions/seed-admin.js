// netlify/functions/seed-admin.js
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

export default async (req) => {
  // Require a one-time header so random people can't call this
  const tokenHeader = req.headers.get('x-seed-token') || '';
  const tokenEnv = process.env.ADMIN_SEED_TOKEN || '';
  if (!tokenEnv || tokenHeader !== tokenEnv) {
    return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  }

  const url = process.env.NEON_DATABASE_URL;
  const plain = process.env.ADMIN_SEED_PASSWORD;
  if (!url)   return Response.json({ ok:false, error:'NEON_DATABASE_URL not set' }, { status:500 });
  if (!plain) return Response.json({ ok:false, error:'ADMIN_SEED_PASSWORD not set' }, { status:500 });

  const client = new Client({ connectionString: url }); // ensure your URL has ?sslmode=require
  await client.connect();
  try {
    await client.query(`
      create table if not exists users (
        username text primary key,
        role text not null,
        password_hash text not null
      )
    `);

    // Refuse to overwrite if admin already exists (safer). Change to UPSERT if you prefer.
    const existing = await client.query('select 1 from users where username=$1', ['admin']);
    if (existing.rowCount) {
      return Response.json({ ok:false, error:'admin already exists; refusing to overwrite' }, { status:409 });
    }

    const hash = await bcrypt.hash(plain, 12);
    await client.query(
      `insert into users (username, role, password_hash) values ($1,'admin',$2)`,
      ['admin', hash]
    );

    return Response.json({ ok:true, user:'admin', note:'Remove this function & clear env vars after use' });
  } catch (e) {
    return Response.json({ ok:false, error: e.message }, { status:500 });
  } finally {
    await client.end();
  }
};

export const config = { path: "/.netlify/functions/seed-admin" };
