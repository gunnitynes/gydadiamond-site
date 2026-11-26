/* Sign-in service for gydadiamond.net's admin.
   It keeps the GitHub key, checks the password, and is the only thing that writes to the website's repository.
   It can change data/*.json and pictures, and nothing else. A new password needs a 6-digit code from the safety
   manager's authenticator app. Secrets: GITHUB_TOKEN, TOTP_SECRET (base32), PEPPER, GUIDE_KEY. */
import { DurableObject } from 'cloudflare:workers';

const FILES = { site: 'object', about: 'object', work: 'array', videos: 'array', news: 'array', shows: 'array', films: 'array', photos: 'array' };
const NAMES = { site: 'front page/settings', shows: 'live' };
const PICTURE = /^(images|images\/t|press)\/[\w-][\w.-]{0,150}\.(jpe?g|png|webp|gif|avif|heic|heif|tiff?)$/i;
const DAY = 86400e3, MIN = 60e3;
const SESSION = 90 * DAY, MAX_SESSIONS = 50;

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key, data, hash) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function base32(s) {
  let bits = 0, v = 0;
  const out = [];
  for (const c of s.replace(/[\s=]/g, '').toUpperCase()) {
    const i = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);
    if (i < 0) throw new Error('TOTP_SECRET is not base32');
    v = (v << 5 | i) & 0xffff; bits += 5;
    if (bits >= 8) { bits -= 8; out.push(v >> bits & 255); }
  }
  return new Uint8Array(out);
}
async function totp(secret, step) {
  const m = new DataView(new ArrayBuffer(8));
  m.setUint32(0, Math.floor(step / 2 ** 32)); m.setUint32(4, step >>> 0);
  const h = await hmac(base32(secret), m.buffer, 'SHA-1'), o = h[19] & 15;
  return String(((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, '0');
}

// ------------------------------------------------------------------ the door: password, sessions, pauses
export class Door extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.line = Promise.resolve(); }

  // one at a time, so nobody gets extra guesses by sending many at once
  turn(fn) { const p = this.line.then(fn); this.line = p.catch(() => {}); return p; }

  // Counts a try BEFORE it is checked. Returns 0, or the seconds to wait.
  async tryOnce(name, free, first, cap, forget) {
    const key = `f:${this.env.EPOCH || 1}:${name}`, now = Date.now();
    let f = await this.ctx.storage.get(key) || { n: 0, until: 0, at: now };
    if (now < f.until) return Math.ceil((f.until - now) / 1000);
    if (now - f.at > forget) f = { n: 0, until: 0, at: now };
    f.n++; f.at = now;
    if (f.n >= free) f.until = now + Math.min(cap, first * 2 ** Math.min(20, f.n - free));
    await this.ctx.storage.put(key, f);
    if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(now + DAY);
    return 0;
  }
  clear(name) { return this.ctx.storage.delete(`f:${this.env.EPOCH || 1}:${name}`); }

  async newSession() {
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const all = [...await this.ctx.storage.list({ prefix: 's:' })].sort((a, b) => a[1] - b[1]);
    for (const [k] of all.slice(0, Math.max(0, all.length - MAX_SESSIONS + 1))) await this.ctx.storage.delete(k);
    await this.ctx.storage.put('s:' + await sha256(token), Date.now() + SESSION);
    return token;
  }
  async verifier(p) { return hex(await hmac(enc.encode(this.env.PEPPER), enc.encode(p), 'SHA-256')); }

  login(ip, p) {
    return this.turn(async () => {
      const want = await this.ctx.storage.get('password');
      if (!want) return { error: 'No password has been chosen yet. Press “Forgot the password, or first time here?”' };
      const who = 'ip:' + ip;
      // the pause for everyone only starts after very many wrong tries, from anywhere, in one hour
      let wait = await this.tryOnce(who, 6, MIN, 60 * MIN, DAY);
      if (!wait) wait = await this.tryOnce('all', 300, 10 * MIN, 60 * MIN, 60 * MIN);
      if (wait) return { wait };
      if (!same(await this.verifier(p), want)) return { error: 'Wrong password.' };
      await this.clear(who); await this.clear('all');
      return { token: await this.newSession() };
    });
  }

  // first password, a change, and a forgotten one: always with a code from the safety manager
  setPassword(p, code) {
    return this.turn(async () => {
      const wait = await this.tryOnce('code', 5, 15 * MIN, DAY, 30 * DAY);
      if (wait) return { wait };
      const now = Math.floor(Date.now() / 30e3), used = await this.ctx.storage.get('step') || 0;
      let step = 0;
      for (const s of [now - 1, now, now + 1]) if (same(await totp(this.env.TOTP_SECRET, s), code) && s > used) step = s;
      if (!step) return { error: 'That code is not right, or it has been used or run out. Ask for a fresh one.' };
      await this.ctx.storage.put('step', step);
      await this.ctx.storage.put('password', await this.verifier(p));
      for (const prefix of ['s:', 'f:']) for (const k of (await this.ctx.storage.list({ prefix })).keys()) await this.ctx.storage.delete(k);
      return { token: await this.newSession() };
    });
  }

  async check(token) {
    const key = 's:' + await sha256(token), until = await this.ctx.storage.get(key);
    if (!until) return false;
    if (until < Date.now()) { await this.ctx.storage.delete(key); return false; }
    // stays signed in as long as it is used now and then
    if (until - Date.now() < SESSION - DAY) await this.turn(async () => { if (await this.ctx.storage.get(key)) await this.ctx.storage.put(key, Date.now() + SESSION); });
    return true;
  }
  async logout(token) { await this.ctx.storage.delete('s:' + await sha256(token)); }
  async ready() { return !!await this.ctx.storage.get('password'); }

  async alarm() { // tidy up old pauses and sessions
    const now = Date.now();
    for (const [k, f] of await this.ctx.storage.list({ prefix: 'f:' })) if (now - f.at > 30 * DAY || (k.includes(':ip:') && now - f.at > DAY && now > f.until)) await this.ctx.storage.delete(k);
    for (const [k, u] of await this.ctx.storage.list({ prefix: 's:' })) if (u < now) await this.ctx.storage.delete(k);
    if ((await this.ctx.storage.list({ prefix: 'f:', limit: 1 })).size) await this.ctx.storage.setAlarm(now + DAY);
  }
}

// ------------------------------------------------------------------ GitHub
class Say extends Error { constructor(status, message) { super(message); this.status = status; } }

async function gh(env, path, opts = {}) {
  const r = await fetch((env.GITHUB_API || 'https://api.github.com') + '/repos/' + env.REPO + path, {
    method: opts.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN, 'User-Agent': 'website-admin', 'X-GitHub-Api-Version': '2022-11-28',
      Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: opts.stream || (opts.body ? JSON.stringify(opts.body) : undefined)
  });
  if (r.ok) return opts.raw ? r.text() : r.status === 204 ? null : opts.keepHeaders ? [await r.json(), r.headers] : r.json();
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Say(502, 'The website’s GitHub key has run out. Tell Gunnar.');
  if (r.status === 403 || r.status === 404) throw new Say(502, 'GitHub refused (' + (j.message || r.status) + '). Tell Gunnar.');
  const e = new Say(502, 'GitHub: ' + (j.message || r.status));
  e.github = r.status;
  throw e;
}
async function headOf(env) {
  const [ref, headers] = await gh(env, '/git/ref/heads/' + env.BRANCH, { keepHeaders: true });
  return [ref.object.sha, headers.get('github-authentication-token-expiration')];
}
async function listData(env, head) {
  const out = {};
  for (const f of await gh(env, '/contents/data?ref=' + head)) if (f.type === 'file') out[f.name.replace(/\.json$/, '')] = f.sha;
  return out;
}
async function readData(env) {
  const [head, expires] = await headOf(env);
  const shas = await listData(env, head), files = {};
  await Promise.all([...Object.keys(FILES), 'calendar'].filter(n => shas[n]).map(async n => {
    files[n] = { text: await gh(env, `/contents/data/${n}.json?ref=${head}`, { raw: true }), sha: shas[n] };
  }));
  return { files, expires };
}

async function publish(env, body) {
  const files = body.files || {}, seen = body.shas || {}, adds = body.adds || {}, dels = body.dels || [];
  for (const [n, t] of Object.entries(files)) {
    if (!Object.hasOwn(FILES, n) || typeof t !== 'string' || t.length > 1e6) throw new Say(400, 'That file can’t be changed here.');
    let v;
    try { v = JSON.parse(t); } catch { throw new Say(400, 'data/' + n + '.json is damaged; nothing was published.'); }
    if (!v || typeof v !== 'object' || Array.isArray(v) !== (FILES[n] === 'array')) throw new Say(400, 'data/' + n + '.json is damaged; nothing was published.');
  }
  for (const [p, s] of Object.entries(adds)) if (!PICTURE.test(p) || !/^[0-9a-f]{40}$/.test(s)) throw new Say(400, 'Only pictures can be added.');
  if (!Array.isArray(dels) || !dels.every(p => typeof p === 'string' && PICTURE.test(p))) throw new Say(400, 'Only pictures can be removed.');
  const names = Object.keys(files), pics = Object.keys(adds).length;
  if (!names.length && !pics && !dels.length) throw new Say(400, 'Nothing to publish.');
  if (pics + dels.length > 400) throw new Say(400, 'Too many pictures at once.');

  for (let attempt = 1; ; attempt++) {
    const [head] = await headOf(env);
    const now = await listData(env, head);
    for (const n of names) if ((now[n] || null) !== (seen[n] || null)) throw new Say(409, 'data/' + n + '.json was changed somewhere else since you opened the admin. Copy your text somewhere safe, reload the page and try again.');
    const commit = await gh(env, '/git/commits/' + head);
    const entry = { mode: '100644', type: 'blob' };
    const tree = [
      ...names.map(n => ({ path: `data/${n}.json`, ...entry, content: files[n] })),
      ...Object.entries(adds).map(([path, sha]) => ({ path, ...entry, sha })),
      ...dels.map(path => ({ path, ...entry, sha: null }))
    ];
    const t = await gh(env, '/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
    const what = names.map(n => NAMES[n] || n);
    if (pics) what.push(pics + ' picture' + (pics === 1 ? '' : 's'));
    if (!what.length) what.push('remove pictures');
    const c = await gh(env, '/git/commits', { method: 'POST', body: { message: 'Admin: update ' + what.join(', '), tree: t.sha, parents: [head] } });
    try {
      await gh(env, '/git/refs/heads/' + env.BRANCH, { method: 'PATCH', body: { sha: c.sha, force: false } });
      return { commit: c.sha };
    } catch (e) { // something else was saved in between (the calendar sync, say): build on that instead
      if (!(e.github === 422 || e.github === 409) || attempt === 3) throw e;
    }
  }
}

// ------------------------------------------------------------------ history: earlier versions of the website
// The versions are GitHub's own commits; bringing one back is done in the admin as ordinary unpublished
// changes, so nothing here writes anything.
async function history(env) {
  const list = await gh(env, `/commits?sha=${env.BRANCH}&path=data&per_page=60`);
  return {
    versions: list.filter(c => !/^Calendar sync/.test(c.commit.message)).slice(0, 40)
      .map(c => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message.split('\n')[0] }))
  };
}
async function treeOf(env, commit) {
  const c = await gh(env, '/git/commits/' + commit);
  return (await gh(env, `/git/trees/${c.tree.sha}?recursive=1`)).tree;
}
async function version(env, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Say(400, 'That version is not known.');
  const [head] = await headOf(env);
  const [old, now] = await Promise.all([treeOf(env, sha), treeOf(env, head)]);
  const was = Object.fromEntries(old.map(e => [e.path, e.sha])), have = new Set(now.map(e => e.path)), files = {};
  await Promise.all(Object.keys(FILES).filter(n => was[`data/${n}.json`]).map(async n => {
    files[n] = await gh(env, `/contents/data/${n}.json?ref=${sha}`, { raw: true });
  }));
  // pictures that version shows but that have been deleted since: they come back from GitHub's own copy
  const pics = {};
  for (const [, p] of Object.values(files).join('\n').matchAll(/"((?:images|press)\/[^"]+)"/g)) {
    const thumb = /^images\/[^/]+$/.test(p) ? 'images/t/' + p.slice(7).replace(/\.[a-z]+$/i, '.jpg') : '';
    for (const q of [p, thumb]) if (q && was[q] && !have.has(q) && PICTURE.test(q)) pics[q] = was[q];
  }
  return { files, pics, raw: `https://raw.githubusercontent.com/${env.REPO}/${sha}/` };
}

// ------------------------------------------------------------------ the front
function ipOf(req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip; // one home = one IPv6 /64
}
async function json(req, max) {
  const t = await req.text();
  if (t.length > max) throw new Say(413, 'That is too big.');
  let v;
  try { v = JSON.parse(t); } catch { /* below */ }
  if (!v || typeof v !== 'object') throw new Say(400, 'That did not arrive in one piece. Try again.');
  return v;
}
function passwordOf(b) {
  if (!/^[0-9a-f]{64}$/.test(b.p)) throw new Say(400, 'The password did not arrive in one piece. Try again.');
  return b.p;
}
function answer(r) {
  if (r.wait) {
    const m = Math.ceil(r.wait / 60);
    throw new Say(429, 'Too many tries. Wait ' + (m < 90 ? m + ' minute' + (m === 1 ? '' : 's') : Math.ceil(m / 60) + ' hours') + ' and try again.');
  }
  if (r.error) throw new Say(403, r.error);
  return r;
}

async function route(req, env) {
  const what = req.method + ' ' + new URL(req.url).pathname;
  for (const s of ['GITHUB_TOKEN', 'TOTP_SECRET', 'PEPPER', 'GUIDE_KEY']) if (!env[s]) throw new Say(503, 'The sign-in service is not set up yet.');
  const door = env.DOOR.get(env.DOOR.idFromName('door'));
  if (what === 'GET /') return { ready: await door.ready() };
  if (what === 'POST /login') return answer(await door.login(ipOf(req), passwordOf(await json(req, 1000))));
  if (what === 'POST /password') {
    const b = await json(req, 1000), p = passwordOf(b), code = String(b.code || '').replace(/\D/g, '');
    if (code.length !== 6) throw new Say(400, 'The code is 6 digits.');
    return answer(await door.setPassword(p, code));
  }
  // everything below needs a signed-in browser
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!/^[0-9a-f]{64}$/.test(token) || !await door.check(token)) throw new Say(401, 'Please sign in again.');
  if (what.startsWith('GET /history/')) return version(env, what.slice(13));
  switch (what) {
    case 'GET /history': return history(env);
    case 'POST /logout': await door.logout(token); return {};
    case 'GET /guide-key': return { key: env.GUIDE_KEY };
    case 'GET /data': return readData(env);
    case 'POST /blob': { // a picture on its way to GitHub; it is not on the website until it is published
      if (+(req.headers.get('Content-Length') || 0) > 70e6) throw new Say(413, 'That picture is too big (45 MB at most).');
      return { sha: (await gh(env, '/git/blobs', { method: 'POST', body: true, stream: req.body })).sha };
    }
    case 'POST /publish': return publish(env, await json(req, 5e6));
    case 'POST /sync-calendar': await gh(env, '/actions/workflows/sync-calendar.yml/dispatches', { method: 'POST', body: { ref: env.BRANCH } }); return {};
  }
  throw new Say(404, 'Not found.');
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '', ok = env.ORIGINS.split(' ').includes(origin);
    const head = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    if (ok) Object.assign(head, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Max-Age': '86400' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });
    if (origin && !ok) return Response.json({ error: 'Not from here.' }, { status: 403, headers: head });
    try {
      return Response.json(await route(req, env), { headers: head });
    } catch (e) {
      if (!(e instanceof Say)) console.error(e.message);
      return Response.json({ error: e instanceof Say ? e.message : 'Something went wrong. Try again in a minute.' }, { status: e.status || 500, headers: head });
    }
  }
};
