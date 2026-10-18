// The widget as ChatGPT runs it (the Apps SDK's window.openai, no MCP Apps bridge), on sample data: test/fixture-api.mjs for the
// apps, a made-up forecast for the weather column, never a real person. Each scenario calls the tool on the server (handle()), hands
// the answer to the widget as ChatGPT does (toolOutput, toolResponseMetadata, then openai:set_globals), clicks what a person would,
// and counts: console errors and page errors (must be 0), sendFollowUpMessage (must be 0: callTool works here, so the card never
// falls back to typing for the user), the links it asked ChatGPT to open, and the tools it called itself. Screenshots at 3x.
//   CHROMIUM=… node test/chatgpt-sim.mjs [--shots DIR]      (playwright-core on NODE_PATH or beside it)
//   SIM_OFFLINE=1 serves fonts and pictures from FONTS_DIR and test/fixtures (a sandbox with no internet); else they load as in ChatGPT.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const tryReq = (m) => { try { return require(m); } catch (e) { return null; } };
const PW = tryReq('playwright-core') || (process.env.NODE_PATH && tryReq(path.join(process.env.NODE_PATH, 'playwright-core')));
if (!PW || !process.env.CHROMIUM) { console.error('Needs playwright-core and CHROMIUM=<a Chromium>.'); process.exit(2); }
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null, OFFLINE = process.env.SIM_OFFLINE === '1';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// ---- the apps (fixture API) and a sample forecast store, on this machine
const PORT = 8890 + Math.floor(Math.random() * 100);
const fx = spawn(process.execPath, [path.join(DIR, 'fixture-api.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok) => fx.stdout.once('data', ok));
const fc = http.createServer((req, res) => { // Open-Meteo's shape, as Windline's forecast store answers: a mild, light-wind week, the same everywhere
  const q = new URL(req.url, 'http://x').searchParams, n = String(q.get('latitude') || '').split(',').length, from = Date.parse(q.get('start_date') + 'T00:00:00Z') / 1000, to = Date.parse(q.get('end_date') + 'T23:00:00Z') / 1000;
  const time = []; for (let t = from; t <= to; t += 3600) time.push(t);
  const h = (f) => time.map((t, i) => f(((t / 3600) % 24), i));
  const one = { hourly: { time, wind_speed_10m: h((hr) => 8 + 6 * Math.sin(hr / 24 * Math.PI)), wind_direction_10m: h(() => 320), wind_gusts_10m: h((hr) => 14 + 8 * Math.sin(hr / 24 * Math.PI)), temperature_2m: h((hr) => 14 + 9 * Math.sin((hr - 6) / 24 * Math.PI)),
    precipitation: h(() => 0), weather_code: h(() => 1), relative_humidity_2m: h(() => 45), cloud_cover: h(() => 20), precipitation_probability: h(() => 5) } };
  res.writeHead(200, { 'Content-Type': 'application/json', 'x-windline-fetched': new Date().toUTCString() }); res.end(JSON.stringify(n > 1 ? Array.from({ length: n }, () => one) : one));
}).listen(0);
const env = { WINDLINE_API: `http://localhost:${PORT}/windline`, RUNFAST_API: `http://localhost:${PORT}/runfast`, MCP_AUTH_API: `http://localhost:${PORT}/windline/api/mcp`, FORECAST_API: `http://localhost:${fc.address().port}/` };
// a place's name to a point (Photon), as the smoke test stubs it
const PLACES = { fourways: [-26.0106, 28.0104, 'Fourways', 'Johannesburg', 'Gauteng'], sandton: [-26.107, 28.056, 'Sandton', 'Johannesburg', 'Gauteng'], 'cape town': [-33.9249, 18.4241, 'Cape Town', '', 'Western Cape'] }, realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => { const s = String(u && u.url || u); if (!s.startsWith('https://photon.komoot.io/')) return realFetch(u, o);
  const P = PLACES[String(new URL(s).searchParams.get('q')).toLowerCase()];
  return Promise.resolve(new Response(JSON.stringify({ features: P ? [{ geometry: { coordinates: [P[1], P[0]] }, properties: { name: P[2], osm_key: 'place', osm_value: P[3] ? 'suburb' : 'city', ...(P[3] ? { city: P[3] } : {}), state: P[4], country: 'South Africa', countrycode: 'ZA' } }] : [] }), { headers: { 'Content-Type': 'application/json' } })); };
const { handle } = await import('../src/server.js'), { WIDGET_HTML } = await import('../src/gen/widget.js');
let n = 0;
async function tool(name, args) {
  const r = await handle(new Request('https://livedot.me/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args, _meta: { 'openai/locale': 'en-ZA', 'openai/userLocation': { country: 'ZA' } } } }) }), env);
  const b = await r.json(); assert.ok(b.result, JSON.stringify(b.error)); return b.result;
}

// ---- ChatGPT, as far as the widget can tell: a conversation, and the widget in a frame with window.openai
const host = http.createServer((req, res) => {
  if (req.url.startsWith('/widget')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(WIDGET_HTML); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChatGPT (simulated)</title>
<style>body{margin:0;background:#fff;color:#0d0d0d;font:16px/1.6 ui-sans-serif,-apple-system,system-ui,"Segoe UI",sans-serif}main{max-width:768px;margin:0 auto;padding:24px 16px 32px}
.me{margin:0 0 20px auto;max-width:78%;width:fit-content;background:#f4f4f4;padding:10px 18px;border-radius:22px}.ai{margin:0 0 12px}.tool{font-size:13px;color:#8f8f8f;margin:0 0 10px}
iframe{display:block;width:100%;border:0;height:420px;background:transparent}</style>
<main><p class="me" id="q"></p><p class="tool" id="t"></p><iframe id="w" title="livedot" src="/widget"></iframe><p class="ai" id="a"></p></main>`);
}).listen(0);
const HOST = `http://localhost:${host.address().port}/`;
const FONTS = process.env.FONTS_DIR || '', PIX = path.join(DIR, 'fixtures', 'sim');
const FONT_CSS = [400, 600, 800].map((w) => `@font-face{font-family:'Schibsted Grotesk';font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/sim/${w}.woff2) format('woff2')}`).join('');

const browser = await PW.chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
async function scenario(S) {
  const res = await tool(S.tool, S.args), out = { name: S.name, errors: [], followUps: [], opened: [], calls: [] };
  for (const [w, label] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 3, isMobile: w < 600, hasTouch: w < 600, locale: 'en-ZA', timezoneId: 'Africa/Johannesburg' });
    if (OFFLINE) await ctx.route('**/*', (r) => { const u = r.request().url();
      if (u.startsWith(HOST)) return r.continue();
      if (u.startsWith('https://fonts.googleapis.com/')) return r.fulfill({ status: 200, contentType: 'text/css', body: FONTS ? FONT_CSS : '' });
      const m = u.match(/^https:\/\/fonts\.gstatic\.com\/sim\/(\d+)\.woff2$/); if (m && FONTS) return r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.join(FONTS, `schibsted-grotesk-latin-${m[1]}-normal.woff2`)) });
      const via = /^https:\/\/livedot\.me\/p\/photo\?u=/.test(u) ? new URL(u).searchParams.get('u') : u; // through the photo relay (livedot.me/p/photo): its picture
      const pic = path.join(PIX, new URL(via).hostname + new URL(via).pathname.replace(/\//g, '_')); // windline.tech/img/rs.png → test/fixtures/sim/windline.tech_img_rs.png
      if (/^https:\/\/(windline|runfast)\.tech\//.test(via) && fs.existsSync(pic)) return r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(pic) });
      return r.fulfill({ status: 404, body: '' }); }); // anything else: not there (a 404, as a missing picture is in ChatGPT; the widget shows initials)
    const page = await ctx.newPage(), mine = { errors: [], followUps: [], opened: [], calls: [] };
    page.on('console', (m) => { if (m.type() === 'error' && !(OFFLINE && /Failed to load resource/.test(m.text()))) mine.errors.push(m.text()); });
    page.on('pageerror', (e) => mine.errors.push(String(e && e.message || e)));
    await page.exposeBinding('simCall', async (src, name, args) => { mine.calls.push(name); const r = await tool(name, args); return { structuredContent: r.structuredContent, content: r.content, _meta: r._meta }; });
    await page.exposeBinding('simFollowUp', async (src, p) => { mine.followUps.push(p); });
    await page.exposeBinding('simOpen', async (src, href) => { mine.opened.push(href); });
    await page.exposeBinding('simHeight', async (src, h) => { await page.evaluate((x) => { document.getElementById('w').style.height = Math.ceil(x) + 'px'; }, h); });
    // window.openai in the widget's frame: what ChatGPT gives it (toolInput, toolOutput, toolResponseMetadata, theme, …) and its calls
    await page.addInitScript(({ args, sc, meta }) => {
      if (!/\/widget/.test(location.pathname)) return;
      window.openai = { theme: 'light', displayMode: 'inline', maxHeight: 2000, locale: 'en-ZA', userAgent: { device: { type: innerWidth < 600 ? 'mobile' : 'desktop' } }, safeArea: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
        toolInput: args, toolOutput: null, toolResponseMetadata: null, widgetState: null,
        callTool: (name, a) => window.simCall(name, a), sendFollowUpMessage: (p) => window.simFollowUp(p), openExternal: ({ href }) => { window.simOpen(href); },
        notifyIntrinsicHeight: (h) => { window.simHeight(h); }, setWidgetState: (s) => { window.openai.widgetState = s; }, requestDisplayMode: async () => ({ mode: 'inline' }) };
      // the answer arrives just after the widget loads, as in ChatGPT: the globals change, then openai:set_globals
      setTimeout(() => { window.openai.toolOutput = sc; window.openai.toolResponseMetadata = meta; window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals: { toolOutput: sc, toolResponseMetadata: meta } } })); }, 350);
    }, { args: S.args, sc: res.structuredContent, meta: res._meta || null });
    await page.goto(HOST, { waitUntil: 'load' });
    await page.evaluate(({ q, t, a }) => { document.getElementById('q').textContent = q; document.getElementById('t').textContent = t; document.getElementById('a').textContent = a; }, { q: S.q, t: `Called livedot · ${S.tool}`, a: S.say || '' });
    const fr = page.frame({ url: /\/widget/ }); await fr.waitForSelector(S.ready, { timeout: 15000 }); await fr.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(500);
    if (SHOTS) { const box = await page.$('main'); await box.screenshot({ path: path.join(SHOTS, `${S.name}-${label}.png`) }); }
    for (const c of S.clicks || []) { await fr.click(c); await page.waitForTimeout(400); }
    if (S.after) await S.after(fr, page);
    out.errors.push(...mine.errors.map((x) => `${label}: ${x}`)); out.followUps.push(...mine.followUps); out.opened.push(...mine.opened); out.calls.push(...mine.calls);
    await ctx.close();
  }
  return out;
}
const SIZES = [[768, 'desktop'], [375, '375']];
const RUN = [
  { name: 'coach-card', q: 'Personal cycling trainer near Fourways, Joburg?', tool: 'find_coaches', args: { place: 'Fourways', sport: 'cycling', format: 'one-to-one' }, ready: '.near li',
    say: 'Two 1-on-1 cycling coaches near Fourways. Book / contact opens their own link; See their page opens their livedot page.',
    clicks: ['.near li:nth-child(2) .lnk', '.near li:nth-child(2) .go', '.near li:nth-child(1) .nm'] },
  { name: 'coach-card-running', q: 'Running coach near Sandton for my first marathon', tool: 'find_coaches', args: { place: 'Sandton', sport: 'running', specialty: 'marathon' }, ready: '.near li',
    clicks: ['.near li:nth-child(1) .go'] },
  { name: 'coach-none', q: 'Running coach in Cape Town', tool: 'find_coaches', args: { place: 'Cape Town', sport: 'running' }, ready: '#lv-none' },
];
let bad = 0;
try {
  for (const S of RUN) {
    const o = await scenario(S);
    const line = `${o.name}: ${o.errors.length} errors, ${o.followUps.length} follow-up messages, ${o.calls.length} tool calls from the card (${[...new Set(o.calls)].join(', ') || 'none'}), ${o.opened.length} links opened${o.opened.length ? ' (' + [...new Set(o.opened)].join(' · ') + ')' : ''}`;
    console.log((o.errors.length || o.followUps.length ? 'FAIL ' : 'ok   ') + line); if (o.errors.length) console.log('     ' + o.errors.join('\n     '));
    if (o.errors.length || o.followUps.length) bad++;
  }
} finally { await browser.close(); host.close(); fc.close(); fx.kill(); }
console.log(bad ? `\n${bad} scenario(s) failed` : '\nAll scenarios: 0 errors, 0 follow-up messages.');
process.exit(bad ? 1 : 0);
