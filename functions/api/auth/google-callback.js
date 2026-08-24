// GET /api/auth/google-callback
// Google redirects here after login. We verify the CSRF state, exchange the
// code for tokens (server-to-server, using our client secret), read the
// signed-in email, and — only if it matches TEACHER_EMAIL and is verified —
// issue a teacher session.

import { createSession, cookie, readCookie } from '../../../lib/session.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = readCookie(request, 'ican_oauth_state');

  if (!code || !state || state !== savedState) {
    return redirectWithError(url.origin, 'auth_state');
  }

  const redirectUri = `${url.origin}/api/auth/google-callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return redirectWithError(url.origin, 'token');
  }

  const tokens = await tokenRes.json();
  const claims = decodeJwt(tokens.id_token);
  const email = (claims.email || '').toLowerCase();
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const allowed = (env.TEACHER_EMAIL || '').toLowerCase();

  if (!email || !verified || !allowed || email !== allowed) {
    return redirectWithError(url.origin, 'not_authorized');
  }

  const session = await createSession(
    { role: 'teacher', via: 'google', email },
    env.SESSION_SECRET
  );

  const headers = new Headers();
  headers.append('Location', `${url.origin}/?teacher=1`);
  headers.append('Set-Cookie', cookie('ican_session', session, 60 * 60 * 8));
  headers.append('Set-Cookie', cookie('ican_oauth_state', '', 0));
  return new Response(null, { status: 302, headers });
}

// Decode a JWT payload (no signature check needed here: the id_token was
// fetched directly from Google over TLS using our client secret, not passed
// through the browser).
function decodeJwt(jwt) {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(payload)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function redirectWithError(origin, reason) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/?auth_error=${reason}` },
  });
}
