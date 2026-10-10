/* /api/state  —  the one shared source of truth for the whole class.
 *   GET   → returns the shared config (any device, no auth). Students read this.
 *   POST  → merges new values into it (teacher only, via the login cookie).
 * Backed by a Workers KV namespace bound to this Pages project as  ICAN.
 *
 * Only these fields are stored (they mirror the app's own localStorage keys):
 *   gates     ← ican_gates          (section locks: Writing Course, tasks, Studio…)
 *   locks     ← ican_lesson_locks   (per-lesson locks)
 *   tiers     ← ican_tiers          (junior/senior per student)
 *   codes     ← ican_codes          (extra class codes)
 *   roster    ← ican_roster         (students you added)
 *   blocked   ← ican_roster_blocked (students you removed)
 *   classLock ← ican_lock           (class open / approved-only)
 */
const KEY = "class:default";
const FIELDS = ["gates", "locks", "tiers", "codes", "roster", "blocked", "classLock", "tierCodes", "itemGates"];

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
async function isTeacher(request, env) {
  if (!env.ADMIN_SECRET) return false;
  const got = readCookie(request, "ican_admin");
  if (!got) return false;
  const want = await sign("teacher", env.ADMIN_SECRET);
  return safeEqual(got, want);
}

export async function onRequestGet({ env }) {
  const raw = env.ICAN ? await env.ICAN.get(KEY) : null;
  return json(raw ? JSON.parse(raw) : { updatedAt: 0 });
}

export async function onRequestPost({ request, env }) {
  if (!env.ICAN) return json({ error: "KV storage not bound (add the ICAN binding)." }, 500);
  if (!(await isTeacher(request, env))) return json({ error: "Not authorized." }, 401);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "Bad JSON." }, 400); }

  const raw = await env.ICAN.get(KEY);
  const cur = raw ? JSON.parse(raw) : {};
  for (const f of FIELDS) if (f in body) cur[f] = body[f];   // only whitelisted fields
  cur.updatedAt = Date.now();

  await env.ICAN.put(KEY, JSON.stringify(cur));
  return json({ ok: true, updatedAt: cur.updatedAt });
}
