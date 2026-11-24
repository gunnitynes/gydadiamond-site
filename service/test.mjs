// Runs the real service against a pretend GitHub:  npm test
import { spawn } from 'node:child_process'; import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createHash, createHmac, randomBytes } from 'node:crypto';
const PORT = 8787, GH = 8790, U = `http://127.0.0.1:${PORT}`, SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ---- pretend GitHub
export const repo = { commit: 'a'.repeat(40), files: {}, blobs: {}, log: [], race: 0, bad: 0 };
const sha = t => createHash('sha1').update(t).digest('hex');
for (const f of fs.readdirSync('../data')) repo.files['data/' + f] = fs.readFileSync('../data/' + f, 'utf8');
let trees = {}, commits = {};
http.createServer(async (q, s) => {
  let b = ''; for await (const c of q) b += c;
  const p = q.url.replace('/repos/gunnitynes/gydadiamond-site', ''), m = q.method, out = (j, c = 200, h = {}) => { s.writeHead(c, h); s.end(typeof j === 'string' ? j : JSON.stringify(j)); };
  repo.log.push(m + ' ' + p);
  if (repo.bad || q.headers.authorization !== 'Bearer test-token') return out({ message: 'Bad credentials' }, 401);
  if (p === '/git/ref/heads/main') return out({ object: { sha: repo.commit } }, 200, { 'github-authentication-token-expiration': '2027-11-01 10:00:00 UTC' });
  if (p.startsWith('/contents/data?')) return out(Object.keys(repo.files).filter(f => f.startsWith('data/')).map(f => ({ type: 'file', name: f.slice(5), sha: sha(repo.files[f]) })));
  if (p.startsWith('/contents/data/')) return out(repo.files['data/' + p.slice(15).split('?')[0]]);
  if (p.startsWith('/git/commits/')) return out({ tree: { sha: 'base' } });
  if (p === '/git/blobs') { const j = JSON.parse(b), x = sha(j.content); repo.blobs[x] = j.content.length; repo.lastLength = q.headers['content-length']; return out({ sha: x }, 201); }
  if (p === '/git/trees') { const j = JSON.parse(b), x = sha(b + Math.random()); trees[x] = j.tree; return out({ sha: x }, 201); }
  if (p === '/git/commits') { const j = JSON.parse(b), x = sha(b + Math.random()); commits[x] = j; return out({ sha: x }, 201); }
  if (p === '/git/refs/heads/main') {
    const j = JSON.parse(b);
    if (repo.race) { repo.race--; repo.commit = sha('race' + Math.random()); return out({ message: 'Update is not a fast forward' }, 422); }
    if (commits[j.sha].parents[0] !== repo.commit || j.force) return out({ message: 'Update is not a fast forward' }, 422);
    for (const e of trees[commits[j.sha].tree]) { if (e.sha === null) delete repo.files[e.path]; else repo.files[e.path] = e.content ?? 'blob:' + e.sha; }
    repo.commit = j.sha; repo.message = commits[j.sha].message; return out({});
  }
  if (p.endsWith('/dispatches')) return out('', 204);
  out({ message: 'Not Found' }, 404);
}).listen(GH, '127.0.0.1');
// ---- the service
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'gyda-'));
export const guideKey = process.env.GUIDE_KEY || randomBytes(32).toString('hex');
const vars = { GITHUB_TOKEN: 'test-token', TOTP_SECRET: SECRET, PEPPER: 'pepper', GUIDE_KEY: guideKey, GITHUB_API: `http://127.0.0.1:${GH}`, ORIGINS: 'https://gunnitynes.github.io http://127.0.0.1:8799' };
const w = spawn('npx', ['wrangler', 'dev', '--port', PORT, '--persist-to', state, ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, detached: true });
let wl = ''; w.stdout.on('data', d => wl += d); w.stderr.on('data', d => wl += d);
for (let i = 0; i < 120; i++) { try { await fetch(U); break; } catch { await sleep(300); if (i === 119) { console.log(wl); stop(1); } } }
export function stop(c = 0) { try { process.kill(-w.pid); } catch {} fs.rmSync(state, { recursive: true, force: true }); process.exit(c); }
// ---- helpers
function b32(s) { let v = 0n; for (const c of s) v = v << 5n | BigInt('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c)); return Buffer.from(v.toString(16).padStart(s.length * 5 / 4, '0'), 'hex'); }
export function code(off = 0) { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30e3) + off)); const h = createHmac('sha1', b32(SECRET)).update(m).digest(), o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); }
export async function api(method, p, body, token, origin, ip) {
  const r = await fetch(U + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(origin ? { Origin: origin } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return { s: r.status, h: r.headers, ...(await r.json().catch(() => ({}))) };
}
if (path.basename(process.argv[1]) === 'test.mjs') {
  let bad = 0; const ok = (n, v, x) => { if (!v) bad++; console.log((v ? 'ok   ' : 'FAIL ') + n, v ? '' : JSON.stringify(x)); };
  const A = 'a1'.repeat(32), B = 'b2'.repeat(32), C = 'c3'.repeat(32);
  let r = await api('GET', '/'); ok('starts without a password', r.s === 200 && r.ready === false, r);
  r = await api('POST', '/login', { p: A }); ok('cannot sign in before one is chosen', r.s === 403, r);
  r = await api('POST', '/password', { p: A, code: '000000' }); ok('wrong code refused', r.s === 403, r);
  r = await api('POST', '/password', { p: 'x', code: code() }); ok('malformed password refused', r.s === 400, r);
  const used = code(); r = await api('POST', '/password', { p: A, code: used }); ok('first password with the right code', r.s === 200 && r.token, r); const t1 = r.token;
  r = await api('POST', '/password', { p: B, code: used }); ok('same code refused the second time', r.s === 403, r);
  r = await api('POST', '/login', { p: B }); ok('wrong password refused', r.s === 403, r);
  r = await api('POST', '/login', { p: A }); ok('right password signs in', r.s === 200, r); const t2 = r.token;
  for (const [m, p] of [['GET', '/data'], ['GET', '/guide-key'], ['POST', '/blob'], ['POST', '/publish'], ['POST', '/sync-calendar']]) { r = await api(m, p, m === 'POST' ? {} : undefined); const r2 = await api(m, p, m === 'POST' ? {} : undefined, 'f'.repeat(64)); ok(`${p} needs sign-in`, r.s === 401 && r2.s === 401, [r, r2]); }
  r = await api('GET', '/data', undefined, t2, 'https://evil.example'); ok('other websites refused', r.s === 403 && !r.h.get('access-control-allow-origin'), r);
  r = await api('GET', '/data', undefined, t2, 'https://gunnitynes.github.io'); ok('the site is allowed, all files come', r.s === 200 && Object.keys(r.files).length === 9 && r.h.get('access-control-allow-origin') === 'https://gunnitynes.github.io', r);
  ok('texts are exact', Object.entries(r.files).every(([n, f]) => f.text === fs.readFileSync(`../data/${n}.json`, 'utf8')), 0); ok('key expiry is passed on', /2027/.test(r.expires), r.expires);
  const shas = Object.fromEntries(Object.entries(r.files).map(([n, f]) => [n, f.sha])); const news = JSON.parse(r.files.news.text);
  r = await api('GET', '/guide-key', undefined, t2); ok('guide key for signed-in', r.key === guideKey, r);
  r = await api('POST', '/blob', { content: 'A'.repeat(20e6), encoding: 'base64' }, t2); ok('a 15 MB picture uploads', r.s === 200 && repo.blobs[r.sha] === 20e6, r); const pic = r.sha; console.log('     sent with length', repo.lastLength);
  const pub = (x) => api('POST', '/publish', x, t2);
  const before = repo.commit;
  for (const [n, x] of Object.entries({
    'page code': { adds: { 'index.html': pic } }, 'script': { adds: { 'js/app.js': pic } }, 'svg': { adds: { 'images/x.svg': pic } }, 'html in images': { adds: { 'images/x.html': pic } },
    'climbing out': { adds: { 'images/../js/x.jpg': pic } }, 'workflow': { adds: { '.github/workflows/x.jpg': pic } }, 'deep folder': { adds: { 'images/a/b.jpg': pic } }, 'strange name': { adds: { 'images/.jpg': pic } },
    'deleting code': { dels: ['js/app.js'] }, 'deleting data': { dels: ['data/news.json'] }, 'unknown file': { files: { calendar: '[]' }, shas }, 'proto': { files: { constructor: '[]' }, shas }, 'path in name': { files: { '../index': '[]' }, shas },
    'broken JSON': { files: { news: '[{' }, shas }, 'wrong shape': { files: { news: '{}' }, shas }, 'nothing': {}, 'bad sha': { adds: { 'images/x.jpg': 'zz' } }, 'dels not a list': { dels: 'images/x.jpg' }
  })) { r = await pub(x); ok('refused: ' + n, r.s === 400, r); }
  ok('nothing was changed by those', repo.commit === before, 0);
  r = await pub({ files: { news: '[]' }, shas: { news: 'b'.repeat(40) } }); ok('refused: changed somewhere else', r.s === 409, r);
  news.unshift({ title: 'Próf ð' }); repo.race = 1;
  r = await pub({ files: { news: JSON.stringify(news) }, shas, adds: { 'images/20261124-x.jpg': pic, 'images/t/20261124-x.jpg': pic, 'press/20261124-x.heic': pic } });
  ok('publishes, also when something else saves in between', r.s === 200 && JSON.parse(repo.files['data/news.json'])[0].title === 'Próf ð' && repo.files['press/20261124-x.heic'], r); ok('commit message', repo.message === 'Admin: update news, 3 pictures', repo.message);
  r = await pub({ dels: ['images/20261124-x.jpg'] }); ok('removes a picture', r.s === 200 && !repo.files['images/20261124-x.jpg'], r);
  r = await api('POST', '/sync-calendar', {}, t2); ok('calendar sync', r.s === 200, r);
  repo.bad = 1; r = await api('GET', '/data', undefined, t2); ok('a run-out GitHub key is explained', r.s === 502 && /run out/.test(r.error), r); repo.bad = 0;
  r = await api('POST', '/logout', {}, t1); r = await api('GET', '/guide-key', undefined, t1); ok('sign out ends that session', r.s === 401, r);
  r = await api('POST', '/password', { p: B, code: code(1) }); ok('password changed', r.s === 200, r); const t3 = r.token;
  r = await api('GET', '/guide-key', undefined, t2); ok('other devices are signed out', r.s === 401, r);
  r = await api('GET', '/guide-key', undefined, t3); ok('this device stays signed in', r.s === 200, r);
  r = await api('POST', '/login', { p: A }); ok('old password no longer works', r.s === 403, r);
  r = await api('POST', '/login', { p: B }); ok('new one does', r.s === 200, r);
  const rs = await Promise.all(Array.from({ length: 30 }, () => api('POST', '/login', { p: C }))); ok('30 guesses at once: only 6 are looked at', rs.filter(x => x.s === 403).length === 6 && rs.filter(x => x.s === 429).length === 24, rs.map(x => x.s));
  r = await api('POST', '/login', { p: B }); ok('then even the right one waits', r.s === 429 && /Wait 1 minute/.test(r.error), r);
  r = await api('GET', '/guide-key', undefined, t3); ok('but a signed-in browser carries on', r.s === 200, r);
  const cs = await Promise.all(Array.from({ length: 20 }, (_, i) => api('POST', '/password', { p: C, code: String(100000 + i) }))); ok('20 code guesses: only 5 are looked at', cs.filter(x => x.s === 403).length === 5 && cs.filter(x => x.s === 429).length === 15, cs.map(x => x.s + x.error));
  console.log(bad ? bad + ' FAILED' : 'all fine'); stop(bad ? 1 : 0);
}
