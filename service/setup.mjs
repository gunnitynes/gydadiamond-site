// Sets up the sign-in service on Cloudflare. Run it yourself, in a terminal:  node setup.mjs
//   node setup.mjs        everything (safe to run again; it continues where it stopped)
//   node setup.mjs key    a new GitHub key
//   node setup.mjs code   the authenticator code on a new phone
// The GitHub key and the authenticator secret go straight to Cloudflare; they are not saved on this computer.
import { spawnSync } from 'node:child_process'; import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import readline from 'node:readline';
import qr from 'qrcode-terminal';
process.chdir(import.meta.dirname);
const GUIDE = path.join(os.homedir(), 'gydadiamond-guide'), only = process.argv[2];
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
const wr = (args, o = {}) => spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', encoding: 'utf8', env, ...o });
const stop = m => { console.log('\n' + m + '\n'); process.exit(1); };
const say = m => console.log('\n\x1b[1m' + m + '\x1b[0m');

function ask(question, secret) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (secret) { const w = rl._writeToOutput; let shown = false; rl._writeToOutput = function (s) { if (!shown) { w.call(rl, s); shown = true; } else w.call(rl, s.startsWith(question) ? question + '•'.repeat(s.length - question.length) : s.replace(/[^\r\n]/g, '•')); }; }
    rl.on('SIGINT', () => process.exit(1));
    rl.question(question, a => { rl.close(); if (secret) console.log(); res(a.trim()); });
  });
}
function put(secrets) { // through stdin, so they are never in a file or a command line
  const r = wr(['secret', 'bulk'], { input: JSON.stringify(secrets), stdio: ['pipe', 'pipe', 'pipe'] });
  if (r.status) stop('Cloudflare did not accept it:\n' + (r.stderr || r.stdout));
}
function have() {
  const r = wr(['secret', 'list', '--format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status) stop('Could not ask Cloudflare:\n' + (r.stderr || r.stdout));
  return JSON.parse(r.stdout.slice(r.stdout.indexOf('['))).map(x => x.name);
}

async function githubKey() {
  say('The GitHub key');
  console.log(`Open  https://github.com/settings/personal-access-tokens/new  and make a key with:
   Token name          Gyda website
   Expiration          one year (or "No expiration")
   Repository access   Only select repositories -> gydadiamond-site
   Permissions         Repository -> Contents: Read and write,  Actions: Read and write
Press "Generate token", copy it, then paste it here (Cmd+V) and press Enter.
You will see a row of dots instead of the key.`);
  for (;;) {
    const t = await ask('Key: ', true);
    const r = await fetch('https://api.github.com/repos/gunnitynes/gydadiamond-site', { headers: { Authorization: 'Bearer ' + t, 'User-Agent': 'website-admin' } }).catch(() => null);
    if (!r) { console.log('No connection to GitHub. Try again.'); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) console.log('GitHub did not accept that key. Was it copied whole? Try again.');
    else if (!j.permissions?.push) console.log('That key can’t change the website. Check the repository and "Contents: Read and write", and try again.');
    else { put({ GITHUB_TOKEN: t }); console.log('✓ The key works and is stored at Cloudflare.'); return; }
  }
}
function code(secret, off) {
  let bits = ''; for (const c of secret) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(x => parseInt(x, 2))), m = Buffer.alloc(8);
  m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30e3) + off));
  const h = createHmac('sha1', key).update(m).digest(), o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
async function authenticator() {
  say('The codes on your phone');
  const secret = [...randomBytes(32)].map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b & 31]).join('');
  qr.generate(`otpauth://totp/gydadiamond.net:admin?secret=${secret}&issuer=gydadiamond.net`, { small: true });
  console.log('Scan this with your authenticator app (Apple Passwords, Google Authenticator …).\nCan’t scan? Type this in the app instead:  ' + secret.match(/.{4}/g).join(' ') + '\n');
  for (;;) {
    const c = (await ask('Now type the 6 digits the app shows: ')).replace(/\D/g, '');
    if ([-1, 0, 1].some(o => code(secret, o) === c)) break;
    console.log('Not that one. Wait for the next code and try again.');
  }
  put({ TOTP_SECRET: secret });
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // take the secret off the screen
  console.log('✓ Your phone is now the one that gives the codes.');
}

if (!process.stdin.isTTY) stop('Please run this in a terminal.');
if (!fs.existsSync('node_modules/wrangler')) { say('Getting the tools ready…'); spawnSync('npm', ['install', '--no-fund', '--no-audit'], { stdio: 'inherit' }); }
const me = wr(['whoami'], { stdio: ['ignore', 'pipe', 'pipe'] });
if (/not authenticated/i.test(me.stdout + me.stderr)) {
  say('Signing in to Cloudflare'); console.log('A browser window opens. Sign in (or make a free account) and press Allow.');
  if (wr(['login']).status) stop('Not signed in to Cloudflare. Run this again when you are ready.');
}
if (only === 'key') { await githubKey(); process.exit(0); }
if (only === 'code') { await authenticator(); process.exit(0); }

say('Putting the service on Cloudflare');
console.log('If it asks for a workers.dev subdomain, answer yes and choose any short name.');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gyda-')), 'out.ndjson');
if (wr(['deploy'], { env: { ...env, WRANGLER_OUTPUT_FILE_PATH: out } }).status) stop('That did not work. Nothing on the website has changed.');
const url = (fs.readFileSync(out, 'utf8').match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
if (!url) stop('The service is up, but its address was not found. Tell Claude.');

const got = have();
if (!got.includes('PEPPER')) put({ PEPPER: randomBytes(32).toString('hex') });
put({ GUIDE_KEY: fs.readFileSync(GUIDE + '/.key', 'utf8').trim() });
if (!got.includes('GITHUB_TOKEN')) await githubKey();
if (!got.includes('TOTP_SECRET')) await authenticator();

const f = '../admin/service.js', s = fs.readFileSync(f, 'utf8');
fs.writeFileSync(f, s.replace(/var URL_LIVE = '[^']*'/, `var URL_LIVE = '${url}'`));
say('All set up.');
console.log('The service is at ' + url + '\nThe website still uses the old admin. Tell Claude “the setup is done”.\n');
