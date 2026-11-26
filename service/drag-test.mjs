// Dragging photos into order, with a mouse and with a finger:  node drag-test.mjs [folder for pictures]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const web = spawn('python3', ['../_source/serve.py', '8799'], { stdio: 'ignore' });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gyda-chrome-')), OUT = process.argv[2];
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9339', '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let t; for (let i = 0; i < 60; i++) { try { t = (await (await fetch('http://127.0.0.1:9339/json')).json()).find(x => x.type === 'page'); if (t) break; } catch {} await sleep(250); }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pend = {}; let errs = 0;
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend[m.id]) pend[m.id](m); if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }); if (m.method === 'Runtime.exceptionThrown') { errs++; console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 300)); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async js => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${js}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) console.log('     EVAL', r.result.exceptionDetails.exception?.description?.slice(0, 160)); return r.result?.result?.value; };
const shot = async n => { if (OUT) fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from((await send('Page.captureScreenshot')).result.data, 'base64')); };
for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:8799/'); break; } catch { await sleep(250); } }
let bad = 0; const ok = (n, v, x) => { if (!v) bad++; console.log((v ? 'ok   ' : 'FAIL ') + n, v ? '' : JSON.stringify(x)); };
const order = () => ev(`return [...document.querySelectorAll('.ptile')].map(t=>t.querySelector('img').getAttribute('src').split('/').pop()).join('|')`);
const center = i => ev(`document.querySelectorAll('.ptile')[${i}].scrollIntoView({block:'nearest'});const r=document.querySelectorAll('.ptile')[${i}].getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2),Math.round(r.width)]`);
const saved = () => ev(`document.querySelector('#preview').click();await new Promise(r=>setTimeout(r,200));return JSON.parse(localStorage.getItem('gyda-draft:photos')).map(p=>p.src.split('/').pop()).join('|')`);
const raw = i => ev(`const r=document.querySelectorAll('.ptile')[${i}].getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2),Math.round(r.width)]`);
const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1 })) });
async function open(w, h, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await ev(`const d=document.querySelector('#discard');if(d&&!d.disabled){window.confirm=()=>true;d.click()}`);
  await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: 'http://127.0.0.1:8799/admin/#photos' }); await sleep(1000);
  await ev(`window.open=()=>null;document.querySelector('#try-local').click()`); for (let i = 0; i < 50 && !(await ev(`return document.querySelectorAll('.ptile').length`)); i++) await sleep(200); console.log('     tiles:', await ev(`return document.querySelectorAll('.ptile').length+' '+location.hash+' '+document.querySelector('#signin').hidden`));
}
await send('Page.enable'); await send('Runtime.enable');
// ---- computer
await open(1280, 900, false);
const o0 = (await order()).split('|');
let [x0, y0] = await center(0), [x2, y2, w] = await center(2);
await mouse('mousePressed', x0, y0); for (let k = 1; k <= 12; k++) await mouse('mouseMoved', x0 + (x2 + w / 4 - x0) * k / 12, y0 + (y2 - y0) * k / 12); await sleep(100); await shot('drag-mid');
ok('while dragging, a lifted copy follows and a gap shows', await ev(`return !!document.querySelector('.ptile.lifted')&&!!document.querySelector('.ptile.gap')`));
await mouse('mouseReleased', x2 + w / 4, y2, 0); await sleep(300);
let o1 = (await order()).split('|'); ok('photo 1 moved to place 3', o1[2] === o0[0] && o1[0] === o0[1] && o1[1] === o0[2], o1.slice(0, 4));
ok('it is selected afterwards and nothing else opened', await ev(`return document.querySelector('.ed-head h2').textContent`) === 'Photo 3 of ' + o0.length);
ok('counts as a change', /1 change/.test(await ev(`return document.querySelector('#status').textContent`)), await ev(`return document.querySelector('#status').textContent`));
ok('the new order is what gets published', (await saved()) === o1.join('|'));
// a plain click still opens a photo
[x0, y0] = await center(5); console.log('     click at', x0, y0, await ev(`const e=document.elementFromPoint(${x0},${y0});return e&&e.className+' '+(e.closest('.ptile')?'tile '+[...document.querySelectorAll('.ptile')].indexOf(e.closest('.ptile')):'')`)); await mouse('mousePressed', x0, y0); await mouse('mouseReleased', x0, y0, 0); await sleep(300); console.log('     after', await ev(`return (document.querySelector('.ed-head h2')||{}).textContent+' / '+document.querySelector('#panel .blank')?.textContent`));
ok('a click still opens the photo', await ev(`return document.querySelector('.ed-head h2').textContent`) === 'Photo 6 of ' + o0.length);
ok('a click does not move anything', (await order()) === o1.join('|'));
// Escape cancels
[x0, y0] = await center(0); [x2, y2] = await center(4); await mouse('mousePressed', x0, y0); for (let k = 1; k <= 8; k++) await mouse('mouseMoved', x0 + (x2 - x0) * k / 8, y0 + (y2 - y0) * k / 8);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await mouse('mouseReleased', x2, y2, 0); await sleep(300);
ok('Escape puts it back', (await order()) === o1.join('|') && !(await ev(`return !!document.querySelector('.ptile.lifted')`)));
// far down: the page scrolls along
const last = o0.length - 1; [x0, y0] = await center(0);
await mouse('mousePressed', x0, y0); await mouse('mouseMoved', x0 + 10, y0 + 10); for (let k = 0; k < 40; k++) { await mouse('mouseMoved', x0 + 10, 880); await sleep(60); }
const sy = await ev('return scrollY'); [x2, y2] = await center(last); await mouse('mouseMoved', x2 + 40, y2); await sleep(150); await mouse('mouseReleased', x2 + 40, y2, 0); await sleep(300);
const o2 = (await order()).split('|'); ok('dragging to the bottom scrolls and can reach the end', sy > 300 && o2[last] === o1[0], { sy, end: o2[last], want: o1[0] });
// ---- phone
await open(390, 760, true);
const p0 = (await order()).split('|'); [x0, y0] = await center(0); [x2, y2] = await center(3);
await touch('touchStart', [[x0, y0]]); await touch('touchMove', [[x0 + 3, y0 + 60]]); await touch('touchEnd', []); await sleep(400);
ok('phone: a quick swipe does not pick a photo up', (await order()) === p0.join('|') && !(await ev(`return !!document.querySelector('.ptile.lifted')`)));
await ev(`document.querySelectorAll('.ptile')[0].scrollIntoView({block:'start'});scrollBy(0,-110)`); await sleep(200); const sy0 = await ev('return scrollY'); [x0, y0] = await raw(0); [x2, y2, w] = await raw(3); console.log('     phone from', x0, y0, 'to', x2, y2);
await touch('touchStart', [[x0, y0]]); await sleep(450); ok('phone: holding picks it up', await ev(`return !!document.querySelector('.ptile.lifted')`));
for (let k = 1; k <= 10; k++) { await touch('touchMove', [[x0 + (x2 + w / 4 - x0) * k / 10, y0 + (y2 - y0) * k / 10]]); await sleep(20); } await shot('phone-drag');
ok('phone: the page does not scroll while dragging', (await ev('return scrollY')) === sy0, await ev('return scrollY'));
await touch('touchEnd', []); await sleep(300);
const p1 = (await order()).split('|'); ok('phone: photo 1 moved to place 4', p1[3] === p0[0] && p1[0] === p0[1], p1.slice(0, 5));
console.log(errs ? errs + ' script errors' : 'no script errors', bad ? bad + ' FAILED' : 'all fine');
chrome.kill(); web.kill(); process.exit(bad || errs ? 1 : 0);
