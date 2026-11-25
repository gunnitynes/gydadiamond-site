// The quick post page in a real Chrome (phone size), against the real service and a pretend GitHub:  node post-test.mjs [folder for pictures]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pbkdf2Sync } from 'node:crypto';
const { repo, api, code, stop } = await import('./test.mjs');
const web = spawn('python3', ['../_source/serve.py', '8799'], { stdio: 'ignore' });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gyda-chrome-')), OUT = process.argv[2];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9337', '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let t; for (let i = 0; i < 60; i++) { try { t = (await (await fetch('http://127.0.0.1:9337/json')).json()).find(x => x.type === 'page'); if (t) break; } catch {} await sleep(250); }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}; let errs = 0, dialogs = 0;
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend[m.id]) pend[m.id](m); if (m.method === 'Page.javascriptDialogOpening') { dialogs++; send('Page.handleJavaScriptDialog', { accept: true }); } if (m.method === 'Runtime.exceptionThrown') { errs++; console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 400)); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async js => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${js}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) console.log('EVAL', r.result.exceptionDetails.exception?.description?.slice(0, 200)); return r.result?.result?.value; };
const until = async (js, ms = 9000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await ev('return ' + js)) return true; await sleep(100); } return false; };
const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1.5, mobile: true });
const shot = async n => { if (OUT) { await sleep(700); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64')); } };
const go = async u => { await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: 'http://127.0.0.1:8799' + u }); await sleep(900); };
for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:8799/'); break; } catch { await sleep(250); } }
let bad = 0; const ok = (n, v, x) => { if (!v) bad++; console.log((v ? 'ok   ' : 'FAIL ') + n, v ? '' : JSON.stringify(x)); };
const on = s => `!document.querySelector('#${s}').hidden`, err = s => ev(`return document.querySelector('#${s} .err').textContent`);
const put = (k, o) => ev(Object.entries(o).map(([f, v]) => `{const e=document.querySelector('#${k} [data-k="${f}"]');e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}`).join(''));
const click = s => ev(`document.querySelector('${s}').click()`), submit = k => ev(`document.querySelector('#${k} form').requestSubmit()`);
const list = n => JSON.parse(repo.files[`data/${n}.json`]), text = n => repo.files[`data/${n}.json`];
const PW = 'þrír rauðir selir', salt = fs.readFileSync('../admin/service.js', 'utf8').match(/var SALT = '([0-9a-f]+)', ITER = (\d+)/);
const p = pbkdf2Sync(PW.normalize('NFC'), Buffer.from(salt[1], 'hex'), +salt[2], 32, 'sha256').toString('hex');
await api('POST', '/password', { p, code: code() });
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await size(390, 760);
const N0 = text('news'), S0 = text('shows'), n0 = list('news').length, s0 = list('shows').length;
const picture = `const c=document.createElement('canvas');c.width=3000;c.height=2000;const g=c.getContext('2d');g.fillStyle='#b33';g.fillRect(0,0,3000,2000);g.fillStyle='#fff';g.fillRect(900,600,1200,800);const b=await new Promise(r=>c.toBlob(r,'image/jpeg'));const d=new DataTransfer();d.items.add(new File([b],'IMG_1234.JPG',{type:'image/jpeg'}));const i=document.querySelector('#news .pick input');i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}))`;

await go('/admin/post/'); ok('asks for the password', await ev('return ' + on('signin'))); await shot('1-signin');
await ev(`document.querySelector('#pass').value='wrong wrong wrong';document.querySelector('#signin-form').requestSubmit()`); await until(`/Wrong/.test(document.querySelector('#signin .err').textContent)`); ok('wrong password explained', (await err('signin')) === 'Wrong password.', await err('signin'));
await ev(`document.querySelector('#pass').value=${JSON.stringify(PW)};document.querySelector('#signin-form').requestSubmit()`); ok('signs in', await until(on('home')), await err('signin')); await shot('2-home');
// ---- news
await click('[data-go="news"]'); await submit('news'); ok('a headline is needed', /headline/.test(await err('news')), await err('news'));
await put('news', { title: 'Ný plata á leiðinni', text: 'Halló **öll**!\n\nMeira seinna.', link: 'bandcamp' }); await submit('news'); ok('a broken link is noticed', /link/.test(await err('news')), await err('news'));
await put('news', { link: 'gyda.bandcamp.com', link_label: 'Listen' }); await ev(picture); ok('a picture goes in', await until(`!document.querySelector('#news .pic img').hidden`), await err('news')); await shot('3-news');
await go('/admin/post/'); ok('the draft survives closing the page', await until(on('home')) && /Continue/.test(await ev(`return document.querySelector('[data-go="news"] span').textContent`))); await click('[data-go="news"]');
ok('text and picture are back', await until(`!document.querySelector('#news .pic img').hidden`) && await ev(`return document.querySelector('#news [data-k="text"]').value`) === 'Halló **öll**!\n\nMeira seinna.');
await submit('news'); ok('preview opens', await until(on('preview')), await err('news'));
ok('the preview is the real page with the post first', await until(`(()=>{const d=document.querySelector('#preview iframe').contentDocument;const h=d&&d.querySelector('.feature h2');return h&&h.textContent==='Ný plata á leiðinni'&&d.querySelector('.feature img').naturalWidth===2000})()`)); await sleep(800); await shot('4-preview');
ok('nothing is published by a preview', text('news') === N0);
await click('[data-edit]'); ok('Change goes back', await ev('return ' + on('news'))); await submit('news'); await until(on('preview'));
// bad connection
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }); await click('#publish'); ok('no connection is explained', await until(`/No connection/.test(document.querySelector('#preview .err').textContent)`), await err('preview'));
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
// the session ends, and somebody else saves in between
await api('POST', '/logout', {}, await ev(`return localStorage.getItem('gyda.session')`)); await click('#publish'); ok('a lost session asks again', await until(on('signin')) && /kept/.test(await err('signin')), await err('signin'));
await ev(`document.querySelector('#pass').value=${JSON.stringify(PW)};document.querySelector('#signin-form').requestSubmit()`); ok('and comes back to the post', await until(on('preview')));
repo.race = 1; await ev(`const b=document.querySelector('#publish');b.click();b.click()`); ok('publishes', await until(on('done'), 15000), await err('preview')); await shot('5-done');
const n = list('news')[0]; ok('once, first in the list, the rest untouched', list('news').length === n0 + 1 && JSON.stringify(list('news').slice(1)) === JSON.stringify(JSON.parse(N0)), list('news').length);
ok('the post is exact', n.title === 'Ný plata á leiðinni' && n.text === 'Halló **öll**!\n\nMeira seinna.' && n.link === 'https://gyda.bandcamp.com' && n.link_label === 'Listen' && /^images\/\d{8}-ny-plata-a-leidinni-\w+\.jpg$/.test(n.image), n);
ok('same shape as the admin writes', Object.keys(n).join() === 'date,title,text,image,link,link_label' && text('news').endsWith(']\n') && text('news').startsWith('[\n {\n  "date"'), Object.keys(n));
ok('picture and small picture are there', !!repo.files[n.image] && !!repo.files['images/t/' + n.image.slice(7)]);
ok('the draft is gone', await ev(`return !localStorage.getItem('gyda.post.news')&&!localStorage.getItem('gyda-draft:news')`));
// the website catches up
await ev(`const f=window.fetch;window.fetch=(u,o)=>/data\\/news\\.json\\?t=/.test(u)?Promise.resolve(new Response(${JSON.stringify(text('news'))})):f(u,o)`); ok('says when it is really on the website', await until(`/on the website now/.test(document.querySelector('#done .state').textContent)`, 9000));
// take back
await click('#undo'); ok('take it back', await until(`/Taken back/.test(document.querySelector('#done .state').textContent)`), await err('done')); ok('the list is exactly as before', text('news') === JSON.stringify(JSON.parse(N0), null, 1) + '\n'); ok('its pictures are removed', !repo.files[n.image] && !repo.files['images/t/' + n.image.slice(7)]);
await click('[data-home]'); ok('back home, no old draft', await ev(`return ${on('home')}&&!/Continue/.test(document.querySelector('[data-go="news"] span').textContent)`));
// ---- show
await click('[data-go="shows"]'); await submit('shows'); ok('a venue is needed', /venue/.test(await err('shows')));
ok('earlier venues are suggested', await until(`document.querySelectorAll('#venues option').length>20`)); await put('shows', { venue: 'de roma' }); ok('a known venue fills in its city', await ev(`return document.querySelector('#shows [data-k="city"]').value+document.querySelector('#shows [data-k="country"]').value`) === 'AntwerpBE');
await submit('shows'); ok('a date is needed', /date/.test(await err('shows'))); await put('shows', { date: '2027-05-20', end: '2027-05-18' }); await submit('shows'); ok('last day before first is noticed', /last day/.test(await err('shows')), await err('shows'));
await put('shows', { venue: 'Harpa, Norðurljós', city: 'Reykjavík', country: 'IS', date: '2027-05-20', end: '2027-05-22', with: 'múm', link: 'https://tix.is/x?a=1&b=2' }); await shot('6-show'); await submit('shows'); ok('show preview', await until(on('preview')));
ok('the show is on the Live page, in view', await until(`(()=>{const f=document.querySelector('#preview iframe'),d=f.contentDocument;if(!d||!d.body)return false;const e=[...d.querySelectorAll('#app *')].filter(x=>x.textContent.trim()==='Harpa, Norðurljós')[0];if(!e)return false;const r=e.getBoundingClientRect();return r.top>0&&r.bottom<f.clientHeight})()`)); await sleep(600); await shot('7-show-preview');
await click('#publish'); ok('show published', await until(on('done')), await err('preview')); const s = list('shows')[0];
ok('the show is exact', list('shows').length === s0 + 1 && s.venue === 'Harpa, Norðurljós' && s.date === '2027-05-20' && s.end === '2027-05-22' && s.with === 'múm' && s.link === 'https://tix.is/x?a=1&b=2' && s.status === '', s);
ok('the rest of the shows untouched', JSON.stringify(list('shows').slice(1)) === JSON.stringify(JSON.parse(S0)));
// the answer got lost: trying again must not post twice
await click('[data-home]'); await click('[data-go="shows"]'); await put('shows', { venue: 'Mengi', date: '2027-06-01', city: 'Reykjavík', country: 'IS' }); await submit('shows'); await until(on('preview'));
await ev(`const c=SERVICE.call;let lost=0;SERVICE.call=(m,u,b)=>c(m,u,b).then(r=>{if(u==='/publish'&&!lost++)throw new Error('No connection. Check your internet and try again.');return r})`);
await click('#publish'); await until(`/No connection/.test(document.querySelector('#preview .err').textContent)`); await click('#publish'); ok('trying again does not post twice', await until(on('done')) && list('shows').filter(x => x.venue === 'Mengi' && x.date === '2027-06-01').length === 1, list('shows').filter(x => x.venue === 'Mengi').length);
// changed in the admin since: take back refuses
repo.files['data/shows.json'] = JSON.stringify(list('shows').map(x => x.venue === 'Mengi' && x.date === '2027-06-01' ? { ...x, note: 'sold out' } : x), null, 1) + '\n'; await click('#undo'); ok('take back leaves a changed post alone', await until(`/changed or removed/.test(document.querySelector('#done .err').textContent)`), await err('done'));
// a past date
await click('[data-home]'); await click('[data-go="shows"]'); await put('shows', { venue: 'Mengi', date: '2020-06-01' }); await submit('shows'); await until(on('preview')); ok('a past date is pointed out', /has passed/.test(await err('preview'))); await click('[data-edit]'); dialogs = 0; await click('#shows [data-clear]'); await sleep(300); ok('Clear asks and clears', dialogs === 1 && await ev(`return document.querySelector('#shows [data-k="venue"]').value`) === '');
for (const w of [320, 390, 900]) { await size(w, 700); for (const [k, g] of [['home', ''], ['news', 'news'], ['shows', 'shows']]) { await go('/admin/post/'); if (g) await click(`[data-go="${g}"]`); ok(`${w}: ${k} fits`, await ev(`return document.documentElement.scrollWidth<=${w}`), await ev('return document.documentElement.scrollWidth')); } }
console.log(errs ? errs + ' script errors' : 'no script errors', bad ? bad + ' FAILED' : 'all fine');
chrome.kill(); web.kill(); stop(bad || errs ? 1 : 0);
