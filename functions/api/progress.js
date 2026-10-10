/* /api/progress  —  the class achievement store (student work + scores).
 *
 *   POST  → a device appends ONE record. Students post their own results with no
 *           login; the teacher (login cookie) posts shared items (placement
 *           overrides, feedback replies, prompt library) into a shared bucket.
 *   GET    → ?all=1  (teacher cookie)  → EVERY record for the whole class.
 *            otherwise (a student)      → that student's own records + the shared
 *                                         ones (teacher replies, prompts, placements).
 *
 * Backed by the same Workers KV namespace bound to this Pages project as  ICAN.
 * The record shape is exactly what the app's cloudSave() already emits, e.g.
 *   { date, name, class, code, id, skill, activity, detail, score, max, percent, … }
 * and the app's "message" records: { type:'question'|'qa_reply'|'place_override'|'wa_prompts'|… }
 *
 * KV layout:
 *   prog:index            → { ids:[bucketKey, …] }                 (which buckets exist)
 *   prog:<bucketKey>      → { key, id, name, class, code, recs:[…], updatedAt }
 *   bucketKey = "stu:<id>" | "nm:<code>::<name>" for a student, "__shared__" for the teacher.
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
async function isTeacher(request, env) {
  if (!env.ADMIN_SECRET) return false;
  const got = readCookie(request, "ican_admin");
  if (!got) return false;
  const want = await sign("teacher", env.ADMIN_SECRET);
  return safeEqual(got, want);
}

const INDEX = "prog:index";
const MAX_PER_BUCKET = 1500;         // keep the most recent N records per student
const MAX_RECORD_BYTES = 24000;      // skip a single pathologically large record

function bucketKeyFor(rec, teacher) {
  if (teacher) return "__shared__";
  const id = (rec && rec.id != null) ? String(rec.id).trim() : "";
  if (id) return "stu:" + id;
  const code = (rec && rec.code ? String(rec.code) : "").trim().toLowerCase();
  const name = (rec && rec.name ? String(rec.name) : "").trim().toLowerCase();
  if (name) return "nm:" + code + "::" + name;
  return "__anon__";
}

async function readIndex(env) {
  const raw = await env.ICAN.get(INDEX);
  try { return raw ? JSON.parse(raw) : { ids: [] }; } catch (_) { return { ids: [] }; }
}

export async function onRequestPost({ request, env }) {
  if (!env.ICAN) return json({ error: "KV storage not bound (add the ICAN binding)." }, 500);

  let rec;
  try { rec = await request.json(); } catch (_) { return json({ error: "Bad JSON." }, 400); }
  if (!rec || typeof rec !== "object") return json({ error: "Bad record." }, 400);
  if (JSON.stringify(rec).length > MAX_RECORD_BYTES) return json({ ok: true, skipped: "too-large" });

  const teacher = await isTeacher(request, env);
  const bk = bucketKeyFor(rec, teacher);
  const storeKey = "prog:" + bk;

  const raw = await env.ICAN.get(storeKey);
  let bucket;
  try { bucket = raw ? JSON.parse(raw) : null; } catch (_) { bucket = null; }
  if (!bucket) bucket = { key: bk, id: "", name: "", class: "", code: "", recs: [] };
  if (!Array.isArray(bucket.recs)) bucket.recs = [];

  // keep the freshest identity on a student's bucket so the roster reads cleanly
  if (!teacher) {
    if (rec.id != null) bucket.id = String(rec.id).slice(0, 80);
    if (rec.name)  bucket.name  = String(rec.name).slice(0, 120);
    if (rec.class) bucket.class = String(rec.class).slice(0, 60);
    if (rec.code)  bucket.code  = String(rec.code).slice(0, 40);
  }

  rec._rx = Date.now();                       // server-side receive time (ordering aid)
  bucket.recs.push(rec);
  if (bucket.recs.length > MAX_PER_BUCKET) bucket.recs = bucket.recs.slice(-MAX_PER_BUCKET);
  bucket.updatedAt = Date.now();

  await env.ICAN.put(storeKey, JSON.stringify(bucket));

  const idx = await readIndex(env);
  if (!idx.ids.includes(bk)) { idx.ids.push(bk); await env.ICAN.put(INDEX, JSON.stringify(idx)); }

  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!env.ICAN) return json({ records: [], count: 0 });

  const url = new URL(request.url);
  const teacher = await isTeacher(request, env);
  const wantAll = url.searchParams.get("all") === "1";

  let keys;
  if (teacher && wantAll) {
    const idx = await readIndex(env);
    keys = idx.ids.map(k => "prog:" + k);
  } else {
    // a student: the shared (teacher-authored) bucket + their own
    keys = ["prog:__shared__"];
    const id = (url.searchParams.get("id") || "").trim();
    const code = (url.searchParams.get("code") || "").trim().toLowerCase();
    const name = (url.searchParams.get("name") || "").trim().toLowerCase();
    if (id) keys.push("prog:stu:" + id);
    else if (name) keys.push("prog:nm:" + code + "::" + name);
  }

  const raws = await Promise.all(keys.map(k => env.ICAN.get(k)));
  const out = [];
  for (const raw of raws) {
    if (!raw) continue;
    try { const b = JSON.parse(raw); if (Array.isArray(b.recs)) for (const r of b.recs) out.push(r); }
    catch (_) {}
  }
  return json({ records: out, count: out.length });
}
