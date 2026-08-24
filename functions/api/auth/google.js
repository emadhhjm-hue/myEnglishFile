// GET /api/auth/google
// Starts "Sign in with Google". Redirects to Google's login with a CSRF
// "state" value stashed in a cookie and re-checked in the callback.

import { cookie } from '../../../lib/session.js';

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response('Google sign-in not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/google-callback`;
  const state = crypto.randomUUID();

  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('access_type', 'online');
  authorize.searchParams.set('prompt', 'select_account');

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': cookie('ican_oauth_state', state, 600),
    },
  });
}
