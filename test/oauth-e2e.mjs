// livedot MCP's sign-in, end to end as a client meets it, on the emulators (never production): livedot.me under `wrangler pages dev`
// (with MCP_AUTH_API, MCP_ISSUER and MCP_PROXY_SECRET) in front of Windline's mcpApi (platform/tools/mcp-dev.cjs on the Firestore
// and Auth emulators). A write without a token → 401 → the metadata → registration → authorize → the choose page → Windline's
// sign-in page (the live pages' sheet, signed in with an emulator account) → Allow → the code → tokens → create_event, list,
// publish (confirmed) through /mcp → the draft and the page in the emulator's Firestore. Screenshots at 3x in docs/shots/oauth-*.png.
//   LD=http://localhost:8788 WL_FUNCTIONS=/path/to/Windline/platform/functions node test/oauth-e2e.mjs
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(DIR, '..', 'docs', 'shots');
const require = createRequire(import.meta.url), LD = process.env.LD || 'http://localhost:8788';
const WLF = process.env.WL_FUNCTIONS || '/Users/westhomson/dev/Windline-oauth/platform/functions';
const admin = require(require.resolve('firebase-admin', { paths: [WLF] }));
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'; process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
admin.initializeApp({ projectId: 'demo-windline' }); const db = admin.firestore();
const PW = require('/Users/westhomson/dev/Crossdeck/sdks/web/node_modules/playwright-core');
const CHROMIUM = '/Users/westhomson/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b64u = (b) => Buffer.from(b).toString('base64url'), RUN = Date.now().toString(36).slice(-5);
const step = (m) => console.log('  ✓ ' + m);

// the client's own redirect: a local listener, as Claude Code or an MCP Inspector would run
const CB = 'http://127.0.0.1:9911/callback'; let got = null;
const cbSrv = http.createServer((req, res) => { const u0 = new URL(req.url, 'http://127.0.0.1:9911'); if (u0.pathname === '/callback') got = u0; res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<p>Connected. You can close this tab.</p>'); }).listen(9911);
const rpc = async (body, token) => { const r = await fetch(`${LD}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }) }); return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) }; };
const gpx = (n, lat, lon) => `<?xml version="1.0"?><gpx version="1.1"><trk><name>Day - Pietermaritzburg to Durban</name><trkseg>${Array.from({ length: n }, (_, i) => `<trkpt lat="${(lat - i * 0.0015).toFixed(5)}" lon="${(lon + i * 0.0035).toFixed(5)}"><ele>${600 - i}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`;

try {
  // an organiser's account on the emulator, and the page they run
  const email = `organiser-${RUN}@example.test`, password = 'emulator-only-' + crypto.randomBytes(6).toString('hex');
  const u = await admin.auth().createUser({ email, password, emailVerified: true, displayName: 'Thandi Mokoena' });
  await db.doc(`users/${u.uid}`).set({ name: 'Thandi Mokoena' }); await db.doc('pages/kzn-cycling').set({ name: 'KZN Cycling Club', type: 'club', admins: [u.uid] });

  // 1. a write with no token: 401, and where to sign in
  let r = await rpc({ method: 'tools/call', params: { name: 'list_my_events', arguments: {} } });
  assert.equal(r.status, 401); const wa = r.headers.get('www-authenticate'); assert.match(wa, /resource_metadata="([^"]+)"/); step('a write without a token: 401 ' + wa);
  const prm = await (await fetch(/resource_metadata="([^"]+)"/.exec(wa)[1].replace('https://livedot.me', LD))).json(); const asUrl = prm.authorization_servers[0];
  const as = await (await fetch(`${asUrl}/.well-known/oauth-authorization-server`)).json(); assert.equal(as.issuer, asUrl); step('the metadata: ' + as.authorization_endpoint);
  // 2. registration and PKCE
  const reg = await (await fetch(as.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CB], token_endpoint_auth_method: 'none' }) })).json(); assert.ok(reg.client_id); step('registered: ' + reg.client_id);
  const v = b64u(crypto.randomBytes(32)), c = b64u(crypto.createHash('sha256').update(v).digest()), state = 'st' + RUN;
  const authUrl = `${as.authorization_endpoint}?${new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: CB, code_challenge: c, code_challenge_method: 'S256', state, scope: 'events.read events.write events.publish clubs.post', resource: prm.resource })}`;

  // 3. the browser: choose the account, sign in on Windline's page, Allow
  const browser = await PW.chromium.launch({ executablePath: CHROMIUM, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 3 });
  await ctx.addInitScript(() => { window.open = () => null; try { navigator.share = () => Promise.resolve(); } catch (e) {} try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() } }); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(authUrl); await page.waitForSelector('a.app'); await page.screenshot({ path: path.join(OUT, 'oauth-1-choose.png') }); step('the choose page (livedot.me/oauth/authorize)');
  await page.click('a.app:has-text("Windline")'); await page.waitForSelector('#signin, #yes'); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'oauth-2-windline-signed-out.png') }); step('Windline’s page, signed out');
  await page.click('#signin'); await page.waitForSelector('input[name=email]'); await page.fill('input[name=email]', email); await page.click('button:has-text("Continue with email")');
  await page.waitForSelector('input[name=password]'); await page.fill('input[name=password]', password); await page.click('dialog.wls button[type=submit]:has-text("Sign in")');
  await page.waitForSelector('#yes', { timeout: 30000 }).catch(async () => { const close = page.locator('.wls-x'); if (await close.count()) await close.first().click(); await page.waitForSelector('#yes', { timeout: 15000 }); });
  await page.waitForTimeout(400); const x = page.locator('.wls-x'); if (await x.count() && await x.first().isVisible()) { await x.first().click(); await page.waitForTimeout(400); }
  await page.screenshot({ path: path.join(OUT, 'oauth-3-consent.png') }); step('signed in: who’s asking, for what, Allow or Cancel');
  await page.click('#yes'); await page.waitForURL(/127\.0\.0\.1:9911\/callback/, { timeout: 20000 }); await browser.close();
  assert.equal(got.searchParams.get('state'), state); assert.equal(got.searchParams.get('iss'), asUrl); const code = got.searchParams.get('code'); step('back at the client with a code, its state and the issuer');

  // 4. tokens
  const tk = await (await fetch(as.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: v, redirect_uri: CB, client_id: reg.client_id, resource: prm.resource }) })).json();
  assert.ok(tk.access_token && tk.refresh_token); step(`tokens: ${tk.expires_in} s, scopes ${tk.scope}`);
  // 5. the tools, signed in
  r = await rpc({ method: 'tools/call', params: { name: 'create_event', arguments: { type: 'tour', name: 'Midlands to the Sea', description: 'Two days down to Durban.', days: [{ gpx: gpx(400, -29.6, 30.38), start: '2027-03-06 06:00', label: 'Day 1' }, { gpx: gpx(300, -29.75, 30.75), start: '2027-03-07 06:30', label: 'Day 2' }] } } }, tk.access_token);
  assert.equal(r.status, 200); const text = r.body.result.content[0].text, id = r.body.result.structuredContent.id; console.log('\n    ' + text.replace(/\n/g, '\n    ') + '\n');
  const t = (await db.doc(`tours/${id}`).get()).data(); assert.equal(t.status, 'draft'); assert.equal(t.ownerUid, u.uid); assert.equal(t.page, 'kzn-cycling'); assert.equal(t.tz, 'Africa/Johannesburg'); assert.equal(t.startDate, '2027-03-06');
  step('create_event: a draft tour in the emulator’s Firestore, on their club’s page, time zone from where it starts');
  r = await rpc({ method: 'tools/call', params: { name: 'publish_event', arguments: { event_id: id, address: 'midlands-sea-' + RUN, confirm: true } } }, tk.access_token);
  assert.equal(r.status, 200); console.log('    ' + r.body.result.content[0].text.split('\n')[0]); assert.equal((await db.doc(`tours/${id}`).get()).get('status'), 'published'); step('publish_event (confirmed)');
  r = await rpc({ method: 'tools/call', params: { name: 'list_my_events', arguments: {} } }, tk.access_token); console.log('    ' + r.body.result.content[0].text.split('\n')[0]); step('list_my_events');
  console.log('\nall good');
} catch (e) { console.error('FAILED', e); process.exitCode = 1; } finally { cbSrv.close(); }
process.exit();
