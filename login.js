// POST /api/login   { "password": "..." }
// Checks the typed password against a hash stored as an env secret,
// then issues a teacher session cookie. The password itself never
// appears in the HTML or in this code.

import { sha256Hex, timingSafeEqual, createSession, cookie } from '../../lib/session.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const password = (body.password || '').toString();

  if (!password) {
    return json({ ok: false, error: 'Password required' }, 400);
  }
  if (!env.SESSION_SECRET || !env.TEACHER_PASSWORD_HASH) {
    return json({ ok: false, error: 'Server not configured' }, 500);
  }

  const submittedHash = await sha256Hex(password);
  const expected = env.TEACHER_PASSWORD_HASH.toLowerCase();

  if (!timingSafeEqual(submittedHash, expected)) {
    return json({ ok: false, error: 'Incorrect password' }, 401);
  }

  const token = await createSession(
    { role: 'teacher', via: 'password', email: env.TEACHER_EMAIL || null },
    env.SESSION_SECRET
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie('ican_session', token, 60 * 60 * 8),
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
