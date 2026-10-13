// Behaviour test for a built deck: presenter pop-up + two-way sync, and the in-window
// fallback inside a sandboxed iframe. Needs Node >= 22 (global WebSocket/fetch) and Chrome.
//
//   node sync_test.mjs /abs/path/deck.html
//
// Prints one line per check with the expected value; exits 1 if any check fails.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: node sync_test.mjs /abs/path/deck.html'); process.exit(2); }
const CH = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => p && existsSync(p));
if (!CH) { console.error('no Chrome found; set CHROME=/path/to/chrome'); process.exit(2); }

// Serve over http so the sandboxed-iframe case behaves like a real host (file:// has its own rules).
const deck = readFileSync(file);
const host = sb => `<body style="margin:0"><iframe sandbox="${sb}" allow="fullscreen" src="/deck.html" style="border:0;width:100vw;height:100vh"></iframe>`;
const srv = createServer((q, s) => {
  const u = q.url.split(/[?#]/)[0];
  s.setHeader('content-type', 'text/html; charset=utf-8');
  s.end(u === '/deck.html' ? deck : u === '/locked.html' ? host('allow-scripts') : u === '/popups.html' ? host('allow-scripts allow-popups') : 'not found');
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + JSON.stringify(got) + (ok ? '' : '  (expected ' + JSON.stringify(want) + ')')); };
const KEY = (k, c) => `dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',code:'${c}'}))`;

async function session(path, run) {
  const prof = mkdtempSync(join(tmpdir(), 'ws-chrome-'));
  const port = 9400 + Math.floor(Math.random() * 500);
  const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--disable-popup-blocking', '--user-data-dir=' + prof, '--remote-debugging-port=' + port, '--window-size=1440,900', base + path], {stdio: 'ignore'});
  const list = async () => { try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { return []; } };
  const conn = t => new Promise(res => {
    const ws = new WebSocket(t.webSocketDebuggerUrl); let id = 0; const p = {};
    ws.onmessage = e => { const m = JSON.parse(e.data); if (p[m.id]) { p[m.id](m.result); delete p[m.id]; } };
    ws.onopen = () => res({ev: (expression, gesture) => new Promise(r => { p[++id] = x => r(x?.result?.value ?? ('EXC ' + JSON.stringify(x).slice(0, 200))); ws.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, userGesture: !!gesture, returnByValue: true}})); })});
  });
  // a deck target is ready once its script has run (cur is defined)
  const target = async (want) => {
    for (let i = 0; i < 60; i++) {
      const t = (await list()).find(t => t.url.includes('/deck.html') && t.url.includes('?speaker') === want);
      if (t) { const c = await conn(t); for (let j = 0; j < 20; j++) { if (await c.ev('typeof cur') === 'number') return c; await sleep(150); } }
      await sleep(250);
    }
    return null;
  };
  try { await run({target, list}); } catch (e) { fails++; console.log('FAIL ' + path + ': ' + e.message); }
  chrome.kill(); await sleep(300); try { rmSync(prof, {recursive: true, force: true}); } catch (e) {}
}

const twoWindows = label => async ({target, list}) => {
  const main = await target(false); if (!main) throw new Error('deck did not load');
  const n = await main.ev('slides.length'), a = Math.min(4, n - 1);
  await main.ev(`go(${a})`);
  await main.ev(KEY('Process', 'KeyP'), true);             // P while an IME is active
  const spk = await target(true); if (!spk) throw new Error('presenter window did not open');
  check(label + ' presenter opens on the current slide', [await spk.ev('SP'), await spk.ev('cur')], [true, a]);
  await main.ev('go(cur-1)'); await sleep(300);
  check(label + ' audience -> presenter', [await main.ev('cur'), await spk.ev('cur')], [a - 1, a - 1]);
  await spk.ev(KEY('ArrowRight', 'ArrowRight')); await sleep(300);
  check(label + ' presenter -> audience', [await main.ev('cur'), await spk.ev('cur')], [a, a]);
  check(label + ' presenter shows next slide + notes', [await spk.ev("slides.findIndex(s=>s.classList.contains('next'))"), await spk.ev("notes.textContent===(NOTES[cur]||'')")], [a + 1 < n ? a + 1 : -1, true]);
  check(label + ' audience window shows no notes / preview', await main.ev("getComputedStyle(notes).display+' '+document.querySelectorAll('.slide.next').length+' '+getComputedStyle(document.getElementById('sp')).display"), 'none 0 none');
  await main.ev(KEY('p', 'KeyP'), true); await sleep(600);
  check(label + ' P again reuses the window', [(await list()).filter(t => t.url.includes('?speaker')).length, await main.ev('SP')], [1, false]);
  await spk.ev('pause()'); const t = await spk.ev('spt.textContent'); await sleep(1300);
  check(label + ' paused timer holds', await spk.ev('spt.textContent'), t);
};

await session('/deck.html', twoWindows('[top-level]'));
await session('/popups.html', twoWindows('[iframe allow-popups]'));
await session('/locked.html', async ({target, list}) => {
  const d = await target(false); if (!d) throw new Error('deck did not load');
  await d.ev(KEY('p', 'KeyP'), true); await sleep(600);
  check('[iframe no pop-ups] P falls back to in-window presenter view', [await d.ev('SP'), await d.ev('B.className'), (await list()).filter(t => t.url.includes('?speaker')).length], [true, 'speaker', 0]);
  await d.ev(KEY('Escape', 'Escape')); await sleep(300);
  check('[iframe no pop-ups] Esc leaves it', [await d.ev('SP'), await d.ev('B.className')], [false, '']);
});

srv.close();
console.log(fails ? fails + ' check(s) FAILED' : 'all checks passed');
process.exit(fails ? 1 : 0);
