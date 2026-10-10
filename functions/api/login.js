/* /api/login  —  teacher sign-in.
 * The app already POSTs { password } here and expects { ok:true } on success.
 * On success we set a signed, HttpOnly cookie that /api/state trusts for writes.
 * Requires two encrypted environment variables on the Pages project:
 *   TEACHER_PASSWORD  – the teacher code you type in the app
 *   ADMIN_SECRET      – any long random string (used only to sign the cookie)
 */
const json = (o, s = 200, h = {}) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...h } });

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  let pw = "";
  try { pw = (await request.json()).password || ""; } catch (_) {}
  if (!env.TEACHER_PASSWORD || !env.ADMIN_SECRET)
    return json({ error: "Server not configured yet." }, 500);
  if (pw !== env.TEACHER_PASSWORD)
    return json({ error: "Incorrect teacher code." }, 401);

  const token = await sign("teacher", env.ADMIN_SECRET);
  const cookie = `ican_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 12}`;
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
