// GET /api/auth/callback
// Microsoft redirects here after login. We verify the CSRF state,
// exchange the code for tokens (server-to-server, using our client
// secret), read the signed-in email, and — only if it matches the
// allowed TEACHER_EMAIL — issue a teacher session.

import { createSession, cookie, readCookie } from '../../../lib/session.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = readCookie(request, 'ican_oauth_state');

  if (!code || !state || state !== savedState) {
    return redirectWithError(url.origin, 'auth_state');
  }

  const tenant = env.MS_TENANT || 'common';
  const redirectUri = `${url.origin}/api/auth/callback`;

  // Exchange the authorization code for tokens.
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MS_CLIENT_ID,
        client_secret: env.MS_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: 'openid email profile',
      }),
    }
  );

  if (!tokenRes.ok) {
    return redirectWithError(url.origin, 'token');
  }

  const tokens = await tokenRes.json();
  const claims = decodeJwt(tokens.id_token);
  const email = (claims.email || claims.preferred_username || '').toLowerCase();
  const allowed = (env.TEACHER_EMAIL || '').toLowerCase();

  if (!email || !allowed || email !== allowed) {
    return redirectWithError(url.origin, 'not_authorized');
  }

  const session = await createSession(
    { role: 'teacher', via: 'microsoft', email },
    env.SESSION_SECRET
  );

  const headers = new Headers();
  headers.append('Location', `${url.origin}/?teacher=1`);
  headers.append('Set-Cookie', cookie('ican_session', session, 60 * 60 * 8));
  headers.append('Set-Cookie', cookie('ican_oauth_state', '', 0));
  return new Response(null, { status: 302, headers });
}

// Decode a JWT payload (no signature check needed here: the token was
// fetched directly from Microsoft over TLS using our client secret,
// not passed through the browser).
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
