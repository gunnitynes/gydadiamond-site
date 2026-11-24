// The admin and the guide in a real Chrome, against the real service and a pretend GitHub:  node browser-test.mjs [folder for pictures]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.GUIDE_KEY = fs.readFileSync(os.homedir() + '/gydadiamond-guide/.key', 'utf8').trim();
const { repo, api, code, stop } = await import('./test.mjs');
const web = spawn('python3', ['../_source/serve.py', '8799'], { stdio: 'ignore' });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gyda-chrome-')), OUT = process.argv[2];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9335', '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let t; for (let i = 0; i < 60; i++) { try { t = (await (await fetch('http://127.0.0.1:9335/json')).json()).find(x => x.type === 'page'); if (t) break; } catch {} await sleep(250); }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}; let errs = 0;
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend[m.id]) pend[m.id](m); if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }); if (m.method === 'Runtime.exceptionThrown') { errs++; console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 300)); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async js => (await send('Runtime.evaluate', { expression: `(async()=>{${js}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const until = async (js, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await ev('return ' + js)) return true; await sleep(100); } return false; };
const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
const shot = async n => { if (OUT) fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64')); };
const go = async u => { await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: 'http://127.0.0.1:8799' + u }); await sleep(900); };
for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:8799/'); break; } catch { await sleep(250); } }
let bad = 0; const ok = (n, v, x) => { if (!v) bad++; console.log((v ? 'ok   ' : 'FAIL ') + n, v ? '' : JSON.stringify(x)); };
const vis = s => `!document.querySelector('${s}').hidden`, err = s => ev(`return document.querySelector('${s}').textContent`);
const newpass = async (a, b, c) => { await ev(`new1.value=${JSON.stringify(a)};new2.value=${JSON.stringify(b)};document.querySelector('#code').value='${c}';document.querySelector('#newpass-form').requestSubmit()`); };
const signin = p => ev(`document.querySelector('#pass').value=${JSON.stringify(p)};document.querySelector('#signin-form').requestSubmit()`);
await send('Page.enable'); await send('Runtime.enable'); await size(1180, 800);
await go('/'); await ev(`localStorage.setItem('gyda.key','github_pat_old');localStorage.setItem('gyda.unlocked','x')`);
await go('/admin/'); ok('asks for a password', await ev('return ' + vis('#signin') + '&&document.querySelector("#app").hidden'));
ok('the old key is wiped from the browser', await ev(`return !localStorage.getItem('gyda.key')&&!localStorage.getItem('gyda.unlocked')`));
await signin('whatever whatever'); await until(`/No password/.test(document.querySelector('#signin-err').textContent)`); ok('explains the first time', /No password has been chosen/.test(await err('#signin-err')), await err('#signin-err'));
await ev(`document.querySelector('#forgot').click()`);
await newpass('short', 'short', '123456'); ok('short password refused', /12 char|^$/.test(await err('#newpass-err')), await err('#newpass-err'));
await newpass('þrír rauðir selir', 'annað orð hérna', '123456'); ok('two different ones refused', /not the same/.test(await err('#newpass-err')), await err('#newpass-err'));
await newpass('þrír rauðir selir', 'þrír rauðir selir', '123456'); await until(`/not right/.test(document.querySelector('#newpass-err').textContent)`); ok('wrong code explained', /code is not right/.test(await err('#newpass-err')), await err('#newpass-err'));
await newpass('þrír rauðir selir', 'þrír rauðir selir', code()); ok('first password opens the admin', await until(vis('#app') + `&&/Everything is published/.test(document.querySelector('#status').textContent)`), await err('#newpass-err')); await sleep(300); await shot('admin');
ok('the header fits', await ev(`const n=document.querySelector('.tabs');return n.scrollWidth<=n.clientWidth`), await ev(`const n=document.querySelector('.tabs');return [n.scrollWidth,n.clientWidth]`));
await go('/admin/'); ok('stays signed in after a reload', await until(vis('#app') + `&&/published/.test(document.querySelector('#status').textContent)`));
// edit and publish
await ev(`document.querySelector('[data-tab="news"]').click();document.querySelector('[data-act="add"]').click()`); await sleep(400);
await ev(`const e=document.querySelector('.editor [data-k="title"]');e.value='Ný frétt ð';e.dispatchEvent(new Event('input',{bubbles:true}))`);
// a picture through the photo page
await ev(`document.querySelector('[data-tab="photos"]').click();await new Promise(r=>setTimeout(r,500));const c=document.createElement('canvas');c.width=900;c.height=600;c.getContext('2d').fillRect(0,0,900,600);const b=await new Promise(r=>c.toBlob(r,'image/jpeg'));const f=new File([b],'Mynd Æ.JPG',{type:'image/jpeg'});const d=new DataTransfer();d.items.add(f);document.querySelector('#drop').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:d}))`); await sleep(1500);
// session ends in the middle
const keep = await ev(`return localStorage.getItem('gyda.session')`); await api('POST', '/logout', {}, keep);
await ev(`document.querySelector('#publish').click()`); ok('a lost session asks again and keeps the changes', await until(vis('#signin')) && /still here/.test(await err('#signin-err')), await err('#signin-err'));
await signin('wrong wrong wrong'); await until(`/Wrong/.test(document.querySelector('#signin-err').textContent)`); ok('wrong password explained', (await err('#signin-err')) === 'Wrong password.', await err('#signin-err'));
await signin('þrír rauðir selir'); ok('signing in brings the changes back', await until(vis('#app')) && await until(`/unpublished change/.test(document.querySelector('#status').textContent)`), await err('#status'));
await ev(`document.querySelector('#publish').click()`); ok('publishes', await until(`/Published!/.test(document.querySelector('#toast').textContent)`, 12000), await err('#toast'));
ok('the text is in the repository', /Ný frétt ð/.test(repo.files['data/news.json']), 0);
ok('so are the pictures', Object.keys(repo.files).filter(f => /^(images|images\/t|press)\/\d+-mynd-ae/.test(f)).length === 3, Object.keys(repo.files).filter(f => !f.startsWith('data')));
// conflict
repo.files['data/news.json'] = '[]\n'; await ev(`document.querySelector('[data-tab="news"]').click();await new Promise(r=>setTimeout(r,300));const e=document.querySelector('.editor [data-k="title"]')||(document.querySelector('.item').click(),await new Promise(r=>setTimeout(r,300)),document.querySelector('.editor [data-k="title"]'));e.value='x';e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#publish').click()`);
ok('refuses when changed somewhere else', await until(`/changed somewhere else/.test(document.querySelector('#toast').textContent)`), await err('#toast'));
// guide
await go('/admin/guide/#live'); ok('the guide opens without asking', await until(vis('#guide')) && await ev(`return document.querySelectorAll('#guide section').length+' '+document.querySelectorAll('#guide img').length`) === '13 15', await ev(`return document.querySelectorAll('#guide section').length+' '+document.querySelectorAll('#guide img').length`));
await go('/admin/guide/#phone'); await until(vis('#guide')); await sleep(600); await shot('guide-phone'); await size(375, 780); await go('/admin/guide/#phone'); await until(vis('#guide')); await sleep(600); ok('a topic link lands on its topic', Math.abs(await ev(`return document.querySelector('#phone').getBoundingClientRect().top`)) < 60, await ev(`return document.querySelector('#phone').getBoundingClientRect().top`)); ok('phone: the guide fits', await ev('return document.documentElement.scrollWidth<=375')); await shot('guide-phone-small'); await size(1180, 800);
// change password from inside
await go('/admin/'); await until(`/published/.test(document.querySelector('#status').textContent)`); await ev(`document.querySelector('#change-pass').click()`); await ev(`document.querySelector('#newpass-cancel').click()`); ok('Cancel goes back', await ev('return ' + vis('#app')));
await ev(`document.querySelector('#change-pass').click()`); await newpass('nýtt lykilorð hér 22', 'nýtt lykilorð hér 22', code(1)); ok('password changed from inside', await until(`/new password is saved/.test(document.querySelector('#toast').textContent)`) && await ev('return ' + vis('#app')), await err('#newpass-err'));
await ev(`document.querySelector('#signout').click()`); await sleep(1200); ok('sign out', await until(vis('#signin')) && await ev(`return !localStorage.getItem('gyda.session')`));
await go('/admin/guide/'); ok('the guide is locked again', await until(vis('#lock')));
await ev(`pw.value='þrír rauðir selir';f.requestSubmit()`); await until(`/Wrong/.test(document.querySelector('#err').textContent)`); ok('old password refused by the guide', /Wrong/.test(await err('#err')), await err('#err'));
await ev(`pw.value='nýtt lykilorð hér 22';f.requestSubmit()`); ok('new password opens the guide', await until(vis('#guide')), await err('#err'));
await go('/admin/'); ok('and the admin with it', await until(vis('#app')));
await size(375, 780); await go('/admin/'); await until(`/published/.test(document.querySelector('#status').textContent)`); ok('phone: no sideways scrolling', await ev(`return document.documentElement.scrollWidth<=375`), await ev(`return document.documentElement.scrollWidth`)); await shot('phone-admin');
await ev(`document.querySelector('#change-pass').click()`); ok('phone: new password fits', await ev(`return document.documentElement.scrollWidth<=375`)); await shot('phone-newpass');
await ev(`localStorage.removeItem('gyda.session')`); await go('/admin/'); await shot('phone-signin');
console.log(errs ? errs + ' script errors' : 'no script errors', bad ? bad + ' FAILED' : 'all fine');
chrome.kill(); web.kill(); stop(bad || errs ? 1 : 0);
