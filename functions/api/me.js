/* /api/me  —  "am I signed in as the teacher?"
 * The app calls this on load (bootTeacherSession) to restore a teacher session
 * from the login cookie set by /api/login. Returns:
 *   { authenticated:true, role:"teacher" }   when the cookie is valid
 *   { authenticated:false }                   otherwise
 * No KV needed — this only reads and verifies the signed cookie.
 */
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function readCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function onRequestGet({ request, env }) {
  const got = readCookie(request, "ican_admin");
  if (env.ADMIN_SECRET && got) {
    const want = await sign("teacher", env.ADMIN_SECRET);
    if (safeEqual(got, want)) return json({ authenticated: true, role: "teacher" });
  }
  return json({ authenticated: false });
}
