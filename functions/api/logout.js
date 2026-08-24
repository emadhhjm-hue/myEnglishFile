// GET or POST /api/logout — clears the session cookie.

import { cookie } from '../../lib/session.js';

export async function onRequest() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie('ican_session', '', 0),
    },
  });
}
