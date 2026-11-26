// Edit mode on the website itself, against the real service and a pretend GitHub:  node edit-test.mjs [folder for pictures]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const { repo, api, code, stop } = await import('./test.mjs');
const web = spawn('python3', ['../_source/serve.py', '8799'], { stdio: 'ignore' });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gyda-chrome-')), OUT = process.argv[2];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9349', '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let t; for (let i = 0; i < 60; i++) { try { t = (await (await fetch('http://127.0.0.1:9349/json')).json()).find(x => x.type === 'page'); if (t) break; } catch {} await sleep(250); }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}; let errs = 0, chooser = null;
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend[m.id]) pend[m.id](m); if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }); if (m.method === 'Page.fileChooserOpened') chooser = m.params; if (m.method === 'Runtime.exceptionThrown') { errs++; console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 400)); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async js => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${js}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) console.log('     EVAL', r.result.exceptionDetails.exception?.description?.slice(0, 200)); return r.result?.result?.value; };
const until = async (js, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await ev('return ' + js)) return true; await sleep(100); } return false; };
const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
const typeText = async s => { for (const ch of s) await send('Input.dispatchKeyEvent', { type: 'char', text: ch }); };
const clickAt = async (sel, i = 0, dx = 0.5, dy = 0.5) => { const r = await ev(`const e=document.querySelectorAll('${sel}')[${i}]; if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return [b.left+b.width*${dx}, b.top+Math.min(b.height*${dy}, 60)]`); if (!r) return console.log('     missing', sel); await mouse('mousePressed', r[0], r[1]); await mouse('mouseReleased', r[0], r[1], 0); await sleep(300); };
const go = async u => { await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: 'http://127.0.0.1:8799/' + u }); await sleep(1500); };
const shot = async n => { if (OUT) fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64')); };
for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:8799/'); break; } catch { await sleep(250); } }
let bad = 0; const ok = (n, v, x) => { if (!v) bad++; console.log((v ? 'ok   ' : 'FAIL ') + n, v ? '' : JSON.stringify(x)); };
await send('Page.enable'); await send('Runtime.enable'); await send('Page.setInterceptFileChooserDialog', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const P = 'a1'.repeat(32); const r = await api('POST', '/password', { p: P, code: code() }); const token = r.token;
// a picture to upload
const pic = path.join(prof, 'Nýtt cover.jpg'); fs.writeFileSync(pic, Buffer.from(await (await fetch('http://127.0.0.1:8799/images/film-bg-mountains.jpg')).arrayBuffer()));
await go('NEWS'); ok('visitors see no editing', await ev(`return !document.querySelector('.edit-me') && !document.querySelector('.ed-bar')`));
await ev(`localStorage.setItem('gyda.session','${token}')`); await go('NEWS');
ok('signed in: the Edit button leads to edit mode here', await ev(`return document.querySelector('.edit-me')?.getAttribute('href')`) === '/NEWS?edit', await ev(`return document.querySelector('.edit-me')?.getAttribute('href')`));
await go('NEWS?edit'); ok('edit mode starts with fresh data from the service', await until(`!!document.querySelector('.ed-bar') && /Everything is published/.test(document.querySelector('#ed-status').textContent)`), await ev(`return document.body.innerText.slice(0,200)`));
const t0 = await ev(`return document.querySelector('.feature h2').textContent`);
await clickAt('.feature h2', 0, 0.99); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 }); await typeText(' — ný');
ok('typing changes the headline on the page', await ev(`return document.querySelector('.feature h2').textContent`) === t0 + ' — ný' && /1 change/.test(await ev(`return document.querySelector('#ed-status').textContent`)), await ev(`return document.querySelector('.feature h2').textContent`));
// a new cover on an album, through the picture menu
await go('Work?edit'); await until(`!!document.querySelector('.ed-bar')`);
ok('the change carries over to another page', /1 change/.test(await ev(`return document.querySelector('#ed-status').textContent`)), await ev(`return document.querySelector('#ed-status').textContent`));
await clickAt('.wcard[data-ei] .pic img', 1); ok('clicking a cover offers a new one', await until(`!!document.querySelector('.ed-menu')`));
chooser = null; await ev(`document.querySelector('.ed-menu button').click()`); for (let i = 0; i < 30 && !chooser; i++) await sleep(100);
ok('the file chooser opens', !!chooser); if (chooser) await send('DOM.setFileInputFiles', { files: [pic], backendNodeId: chooser.backendNodeId });
ok('the new cover shows from the browser', await until(`[...document.querySelectorAll('.wcard[data-ei] .pic img')][1].src.startsWith('blob:')`), await ev(`return [...document.querySelectorAll('.wcard[data-ei] .pic img')][1].src`));
await shot('work-cover');
// tools: hide the last album
await ev(`document.querySelectorAll('.wcard[data-ei]')[5].scrollIntoView({block:'center'})`); const h = await ev(`const r=document.querySelectorAll('.wcard[data-ei]')[5].getBoundingClientRect(); return [r.left+r.width/2, r.top+100]`); await mouse('mouseMoved', h[0], h[1]); await sleep(200);
await ev(`document.querySelector('.ed-tools [data-t="more"]').click()`); await sleep(200); await ev(`document.querySelector('.ed-menu button').click()`); await sleep(600);
const hidden = JSON.parse(await ev(`return JSON.stringify([...document.querySelectorAll('.wcard[data-ei] h3')].map(x=>x.textContent))`));
ok('hiding takes it off the page', hidden.length === 5, hidden);
// publish
await ev(`document.querySelector('#ed-publish').click()`); ok('publishes', await until(`/Published!/.test(document.querySelector('#ed-toast').textContent)`, 15000), await ev(`return document.querySelector('#ed-toast').textContent`));
const news = JSON.parse(repo.files['data/news.json']), work = JSON.parse(repo.files['data/work.json']);
ok('the headline is saved', news.some(p => p.title === t0 + ' — ný'), news.slice(0, 2).map(p => p.title));
const cover = work.filter(w => w.section !== 'More')[1].image; ok('the cover and its small copy are saved', /^images\/\d+-/.test(cover) && repo.files[cover] && repo.files['images/t/' + cover.slice(7)], cover);
ok('the hidden album is saved hidden', work.filter(w => w.hidden).length === 1, work.map(w => w.title + (w.hidden ? '*' : '')));
ok('after publishing nothing is waiting', /Everything is published/.test(await ev(`return document.querySelector('#ed-status').textContent`)) && await ev(`return !localStorage.getItem('gyda-edit:draft')`));
// changed somewhere else meanwhile: refused, the change stays
await go('NEWS?edit'); await until(`!!document.querySelector('.ed-bar')`); await sleep(300);
repo.files['data/news.json'] = JSON.stringify(news.slice(1), null, 1) + '\n';
await clickAt('.feature h2', 0, 0.99); await typeText('!');
await ev(`document.querySelector('#ed-publish').click()`); ok('a clash is explained and the change is kept', await until(`/changed somewhere else/.test(document.querySelector('#ed-toast').textContent)`) && /1 change/.test(await ev(`return document.querySelector('#ed-status').textContent`)), await ev(`return document.querySelector('#ed-toast').textContent`));
repo.files['data/news.json'] = JSON.stringify(news, null, 1) + '\n';
await ev(`localStorage.removeItem('gyda-edit:draft')`);
// a phone
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 780, deviceScaleFactor: 1, mobile: true });
await go('About?edit'); await until(`!!document.querySelector('.ed-bar')`);
ok('phone: nothing sticks out sideways', await ev(`return document.documentElement.scrollWidth <= 390 && document.querySelector('.ed-bar').getBoundingClientRect().right <= 391`), await ev(`return document.documentElement.scrollWidth`));
await shot('phone-about');
await ev(`document.querySelector('#ed-photo').click()`); ok('phone: the page photo panel opens', await until(`!!document.querySelector('.ed-sheet')`));
await shot('phone-sheet');
// an old session: sent to the admin to sign in
await ev(`localStorage.setItem('gyda.session','${'f'.repeat(64)}')`); await go('About?edit'); ok('an old session is sent to sign in', await until(`/admin\\//.test(location.pathname)`, 6000), await ev('return location.href'));
console.log(errs ? errs + ' script errors' : 'no script errors', bad ? bad + ' FAILED' : 'all fine');
chrome.kill(); web.kill(); stop(bad || errs ? 1 : 0);
