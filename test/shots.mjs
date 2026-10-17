// Screenshots of the widget as an MCP Apps host renders it (test/host.html), at 3x, cropped to the answer: on sample data
// (test/fixture-api.mjs behind `wrangler pages dev`) and the apps' public demos. Never a real person.
//   MCP=http://localhost:8788/mcp node test/shots.mjs      → docs/shots/*.png
// Needs playwright-core and a Chromium (CHROMIUM=…). Links, share and the clipboard are stubbed; nothing is opened or clicked
// but the widget's own rows.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(DIR, '..', 'docs', 'shots');
const require = createRequire(import.meta.url);
const tryReq = (m) => { try { return require(m); } catch (e) { return null; } };
const PW = tryReq('playwright-core') || tryReq('/Users/westhomson/dev/Crossdeck/sdks/web/node_modules/playwright-core');
const CHROMIUM = process.env.CHROMIUM || '/Users/westhomson/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const MCP = process.env.MCP || 'http://localhost:8788/mcp';
fs.mkdirSync(OUT, { recursive: true });

const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(DIR, 'host.html'))); }).listen(0);
const HOST = `http://localhost:${srv.address().port}/host.html`;
const SHOTS = [
  { name: 'person-handle', q: 'Where’s Megan in the Comrades? (livedot.me/megan)', tool: 'find_person', args: { name_or_handle: '@megan', event: 'Comrades' } },
  { name: 'picker', q: 'Where’s Megan in the Comrades?', tool: 'find_person', args: { name_or_handle: 'Megan', event: 'Comrades' } },
  { name: 'picker-search', q: 'Where’s Megan in the Comrades?', tool: 'find_person', args: { name_or_handle: 'Megan', event: 'Comrades' }, type: 'Bo' },
  { name: 'picker-to-map', q: 'Where’s Megan in the Comrades?', tool: 'find_person', args: { name_or_handle: 'Megan', event: 'Comrades' }, click: 2 },
  { name: 'person-dark', q: 'Where’s Megan in the Comrades?', tool: 'where_is', args: { handle: 'megan' }, theme: 'dark' },
  { name: 'rider-imperial', q: 'Where’s Thandi in the Coast Classic?', tool: 'where_is', args: { handle: 'livedot.me/thandi', units: 'imperial' } },
  { name: 'event', q: 'How’s the Comrades going?', tool: 'event_status', args: { event: 'Comrades' } },
  { name: 'demo-runner', q: 'Where’s the demo runner in the Comrades demo?', tool: 'find_person', args: { name_or_handle: 'demo', event: 'Comrades demo' } },
  { name: 'weather-historic', q: 'What will the weather be like for the NYC Marathon?', tool: 'event_weather', args: { event: 'NYC Marathon' } },
  { name: 'weather-forecast', q: 'What will the weather be like for the Comrades? (the demo)', tool: 'event_weather', args: { event: 'Comrades demo' } },
  { name: 'weather-stages', q: 'Weather for the Gravel Burn this year?', tool: 'event_weather', args: { event: 'Gravel Burn', year: 2026 } },
  { name: 'fly-comrades', q: 'Fly the Comrades', tool: 'fly_route', args: { event_or_route: 'Comrades' }, fly: 9000 },
  { name: 'fly-nyc', q: 'What does the NYC Marathon route look like?', tool: 'fly_route', args: { event_or_route: 'NYC Marathon' }, fly: 12000 },
  { name: 'tour-route', q: 'What\u2019s Alistair\u2019s Durban Tour 2027 route? Give me the GPX files.', tool: 'tour_route', args: { tour: 'Alistair\u2019s Durban Tour 2027' } },
  { name: 'tour-no-files', q: 'Send me the GPX for the AllyCat tour', tool: 'tour_route', args: { tour: 'AllyCat' } },
  { name: 'person-phone', q: 'Where’s Megan?', tool: 'where_is', args: { handle: 'megan' }, width: 390 },
];

const browser = await PW.chromium.launch({ executablePath: CHROMIUM, headless: true });
try {
  for (const s of SHOTS.filter((x) => !process.argv[2] || x.name === process.argv[2])) {
    const ctx = await browser.newContext({ viewport: { width: (s.width || 760) + 32, height: 2600 }, deviceScaleFactor: 3, colorScheme: s.theme === 'dark' ? 'dark' : 'light' });
    if (!process.env.NOINIT) await ctx.addInitScript(() => { window.open = () => null; try { navigator.share = () => Promise.resolve(); } catch (e) { /* */ } try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() } }); } catch (e) { /* */ } });
    const page = await ctx.newPage();
    const u = `${HOST}?server=${encodeURIComponent(MCP)}&tool=${s.tool}&args=${encodeURIComponent(JSON.stringify(s.args))}&q=${encodeURIComponent(s.q)}&theme=${s.theme || 'light'}${s.width ? '&width=' + s.width : ''}`;
    await page.goto(u, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('text').textContent.length > 5, null, { timeout: 60000 });
    // wait on the widget's own frame by polling it (a frameLocator wait left the sandboxed frame unpainted in headless Chromium)
    const frame = () => page.frames().find((x) => x !== page.mainFrame());
    const until = async (sel, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const f = frame(); if (f && await f.evaluate((q) => !!document.querySelector(q), sel).catch(() => false)) return true; await page.waitForTimeout(250); } return false; };
    await until('.card .hd', 30000);
    if (s.click != null) { await frame().evaluate((n) => document.querySelectorAll('.row')[n].click(), s.click); await until('.map', 60000); }
    if (s.type) { await frame().evaluate((t) => { const q = document.getElementById('q'); q.value = t; q.dispatchEvent(new Event('input')); }, s.type); await page.waitForTimeout(400); }
    const isMap = await until('.map', 500);
    if (isMap && !(await until('.map.gl-on', 20000))) console.log(`  ${s.name}: the light map didn't load; the plain map is shown`);
    await page.waitForTimeout(s.fly || (isMap ? 1800 : 400));
    // the whole viewport, then cropped with macOS sips (a clipped capture leaves a sandboxed iframe blank in headless Chromium)
    const full = path.join(OUT, s.name + '.full.png'); await page.screenshot({ path: full });
    const crop = async (sel, out) => { const b = await page.locator(sel).boundingBox(), D = 3, x = Math.floor(b.x * D), y = Math.floor(b.y * D), w = Math.ceil(b.width * D), h = Math.ceil(b.height * D);
      execFileSync('sips', ['-c', String(h), String(w), '--cropOffset', String(y), String(x), full, '--out', out], { stdio: 'ignore' }); };
    await crop('main', path.join(OUT, s.name + '.png')); await crop('#w', path.join(OUT, s.name + '-widget.png')); if (!process.env.KEEP) fs.unlinkSync(full);
    console.log('docs/shots/' + s.name + '.png');
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
