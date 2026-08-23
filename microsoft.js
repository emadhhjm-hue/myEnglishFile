// GET /api/auth/microsoft
// Kicks off "Sign in with Microsoft". Redirects the browser to
// Microsoft's login, with a CSRF "state" value we stash in a cookie
// and re-check in the callback.

import { cookie } from '../../../lib/session.js';

export async function onRequestGet({ request, env }) {
  if (!env.MS_CLIENT_ID) {
    return new Response('Microsoft sign-in not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;
  const tenant = env.MS_TENANT || 'common';
  const state = crypto.randomUUID();

  const authorize = new URL(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
  );
  authorize.searchParams.set('client_id', env.MS_CLIENT_ID);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('response_mode', 'query');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': cookie('ican_oauth_state', state, 600),
    },
  });
}
