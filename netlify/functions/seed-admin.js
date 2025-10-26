// netlify/functions/seed-admin.js
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

exports.handler = async (event) => {
  const tokenHeader = event.headers['x-seed-token'] || event.headers['X-Seed-Token'];
  const tokenEnv = process.env.ADMIN_SEED_TOKEN || '';
  if (!tokenEnv || tokenHeader !== tokenEnv) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  const url = process.env.NEON_DATABASE_URL;
  const plain = process.env.ADMIN_SEED_PASSWORD;
  if (!url)   return json(500, { ok:false, error:'NEON_DATABASE_URL not set' });
  if (!plain) return json(500, { ok:false, error:'ADMIN_SEED_PASSWORD not set' });

  const client = new Client({ connectionString: url }); // ensure ?sslmode=require on the URL
  await client.connect();
  try {
    await client.query(`
      create table if not exists users (
        username text primary key,
        role text not null,
        password_hash text not null
      )
    `);

    // safer: don’t overwrite if admin exists
    const existing = await client.query('select 1 from users where username=$1', ['admin']);
    if (existing.rowCount) return json(409, { ok:false, error:'admin already exists; refusing to overwrite' });

    const hash = await bcrypt.hash(plain, 12);
    await client.query(
      `insert into users (username, role, password_hash) values ($1,'admin',$2)`,
      ['admin', hash]
    );
    return json(200, { ok:true, user:'admin' });
  } catch (e) {
    return json(500, { ok:false, error: e.message });
  } finally {
    await client.end();
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

