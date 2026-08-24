// lib/session.js
// Dependency-free helpers for signed session cookies, password hashing,
// and cookie parsing. Runs on the Cloudflare Pages Functions runtime
// (Web Crypto is available globally — no npm packages, no build step).

const encoder = new TextEncoder();

function b64urlEncode(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// SHA-256 of a string, returned as lowercase hex.
export async function sha256Hex(str) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(str));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Constant-time comparison of two equal-length strings.
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Create a signed, self-contained session token (payload + HMAC signature).
export async function createSession(payload, secret, maxAgeSeconds = 60 * 60 * 8) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds };
  const data = b64urlEncode(encoder.encode(JSON.stringify(body)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return `${data}.${b64urlEncode(sig)}`;
}

// Verify a session token. Returns the payload if valid & unexpired, else null.
export async function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sig),
      encoder.encode(data)
    );
    if (!ok) return null;
    const body = JSON.parse(new TextDecoder().decode(b64urlToBytes(data)));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

// Build a Set-Cookie header value. maxAgeSeconds=0 deletes the cookie.
export function cookie(name, value, maxAgeSeconds) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

// Read a single cookie value from the request.
export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return part.slice(idx + 1).trim();
  }
  return null;
}
