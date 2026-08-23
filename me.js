// GET /api/me
// The front-end calls this on load to decide whether to unlock the
// teacher dashboard. Returns { authenticated, role, email }.

import { verifySession, readCookie } from '../../lib/session.js';

export async function onRequestGet({ request, env }) {
  const token = readCookie(request, 'ican_session');
  const session = await verifySession(token, env.SESSION_SECRET);

  if (session && session.role === 'teacher') {
    return json({
      authenticated: true,
      role: 'teacher',
      via: session.via || null,
      email: session.email || null,
    });
  }
  return json({ authenticated: false });
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
