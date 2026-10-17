// The server, end to end, on sample data (test/fixture-api.mjs) and the apps' public demos: every method, every tool, the privacy
// rule, units, and the picker. Forecasts come from Windline's forecast store, as in production.
//   node test/smoke.mjs            (starts the fixture API itself)
//   node test/smoke.mjs --show     prints each tool's text answer
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { handle, TOOLS, serverCard } from '../src/server.js';

const DIR = path.dirname(fileURLToPath(import.meta.url)), PORT = 8790 + Math.floor(Math.random() * 100);
const fx = spawn(process.execPath, [path.join(DIR, 'fixture-api.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok) => fx.stdout.once('data', ok));
const env = { WINDLINE_API: `http://localhost:${PORT}/windline`, RUNFAST_API: `http://localhost:${PORT}/runfast`, MCP_AUTH_API: `http://localhost:${PORT}/windline/api/mcp` }, SHOW = process.argv.includes('--show');
let n = 0;
const postRaw = (body, h = {}) => handle(new Request('https://livedot.me/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...h }, body: JSON.stringify(body) }), env);
const post = async (body, h = {}) => { const r = await handle(new Request('https://livedot.me/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...h }, body: JSON.stringify(body) }), env); return { status: r.status, body: r.status === 202 ? null : await r.json() }; };
const call = async (name, args, meta) => { const r = await post({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } }); assert.equal(r.status, 200); assert.ok(r.body.result, JSON.stringify(r.body)); const t = r.body.result.content[0].text; if (SHOW) console.log(`\n--- ${name} ${JSON.stringify(args)}${meta ? ' ' + JSON.stringify(meta) : ''}\n${t}`); conforms(name, r.body.result); return r.body.result; };
// every answer that isn't an error matches its tool's outputSchema (what a client that checks structuredContent will do)
const TYPE = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const fits = (v, t) => [].concat(t).some((x) => x === TYPE(v) || (x === 'number' && TYPE(v) === 'integer'));
function conforms(name, res) {
  const o = TOOLS.find((x) => x.name === name).outputSchema; if (res.isError) return;
  const s = res.structuredContent; assert.ok(s && TYPE(s) === 'object', name + ': no structuredContent');
  (o.required || []).forEach((k) => assert.ok(k in s, `${name}: ${k} missing`));
  for (const [k, d] of Object.entries(o.properties)) { if (!(k in s)) continue; if (d.type) assert.ok(fits(s[k], d.type), `${name}.${k}: ${TYPE(s[k])} is not ${d.type}`); if (d.enum) assert.ok(d.enum.includes(s[k]), `${name}.${k}: ${s[k]} not in ${d.enum}`); }
}
const SPONSOR = /Live tracking, proudly brought to you free thanks to \w+\.$/;
const test = async (name, fn) => { try { await fn(); console.log('ok  ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } };

try {
  await test('initialize, list, read the widget', async () => {
    const i = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(i.body.result.protocolVersion, '2025-06-18'); assert.equal(i.body.result.serverInfo.title, 'livedot MCP');
    assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const t = (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body.result.tools;
    assert.deepEqual(t.map((x) => x.name), ['find_person', 'where_is', 'event_status', 'event_weather', 'fly_route', 'tour_route', 'tour_notes', 'plan_route', 'list_my_events', 'create_event', 'update_event', 'add_tour_notes', 'publish_event', 'post_club_ride']);
    t.forEach((x) => assert.ok(!/word for word/.test(x.description), 'a repeat-this instruction')); t.filter((x) => !['tour_notes', 'list_my_events', 'create_event', 'update_event', 'add_tour_notes', 'publish_event', 'post_club_ride', 'plan_route'].includes(x.name)).forEach((x) => { assert.equal(x._meta.ui.resourceUri, 'ui://livedot/live-map.html'); assert.equal(x.annotations.readOnlyHint, true); assert.match(x.inputSchema.properties.units.description, /imperial for users in the US/); });
    const r = (await post({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'ui://livedot/live-map.html' } })).body.result.contents[0];
    assert.equal(r.mimeType, 'text/html;profile=mcp-app'); assert.ok(r._meta.ui.csp.resourceDomains.length);
    const b = await post([{ jsonrpc: '2.0', id: 4, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }]); assert.equal(b.body.length, 1);
  });
  await test('an exact handle answers at once (livedot.me/megan), weather from the engine', async () => {
    const r = await call('find_person', { name_or_handle: 'megan', event: 'Comrades' });
    const s = r.structuredContent, t = r.content[0].text;
    assert.equal(s.view, 'person'); assert.equal(s.name, 'Megan N.'); assert.equal(s.follow_url, 'https://livedot.me/megan');
    assert.ok(s.position && s.position.km > 0); assert.ok(s.goal); assert.ok(s.eta); assert.match(t, SPONSOR); assert.match(t, /km \d+ \(mile \d+\)/);
    assert.ok(s.conditions, 'no conditions: the forecast store didn\'t answer'); assert.ok(s.ahead && s.ahead.length); assert.ok(s.road_ahead);
    assert.match(t, /other people match "megan"/);
    const v = r._meta['livedot/view']; assert.equal(v.kind, 'person'); assert.ok(v.course.length > 100); assert.ok(v.dot); assert.ok(v.stops && v.stops.length);
    assert.ok(!/Naidoo/.test(JSON.stringify(r)), 'a surname leaked');
  });
  await test('many Megans: the top 5 and the total, a picker, a question, never a guess', async () => {
    const r = await call('find_person', { name_or_handle: 'Megan', event: 'the Comrades preview' }), s = r.structuredContent;
    assert.equal(s.view, 'picker'); assert.equal(s.people.length, 5); assert.equal(s.total, '20+'); assert.match(r.content[0].text, /20\+ Megans in the Comrades/); assert.match(r.content[0].text, /ONE short question/);
    const v = r._meta['livedot/view']; assert.equal(v.kind, 'picker'); assert.equal(v.rows.length, 20); assert.ok(v.rows.every((x) => /^Megan [A-Z]\.$/.test(x.name)));
    assert.ok(MOVINGFIRST(v.rows), 'live first');
    const looks = v.rows.map((x) => [x.name, x.where, x.pace, x.goal, x.extra, x.handle].join('|')); assert.equal(new Set(looks).size, looks.length, 'two rows look the same');
  });
  await test('narrowing by surname: one Megan, answered at once', async () => {
    const r = await call('find_person', { name_or_handle: 'Megan', event: 'Comrades', surname: 'Bot' });
    assert.equal(r.structuredContent.view, 'person'); assert.equal(r.structuredContent.name, 'Megan B.');
  });
  await test('a bib: said plainly that the public pages don\'t show bibs', async () => {
    const r = await call('find_person', { name_or_handle: 'Megan', event: 'Comrades', bib: '12345' });
    assert.match(r.content[0].text, /don't show bib numbers/);
  });
  await test('where_is by a picker row id', async () => {
    const p = await call('find_person', { name_or_handle: 'Megan', event: 'Comrades' }), id = p._meta['livedot/view'].rows[3].id;
    const r = await call('where_is', { person: id }); assert.equal(r.structuredContent.view, 'person'); assert.ok(r.structuredContent.name.startsWith('Megan'));
  });
  await test('a rider by handle, imperial by the tool\'s units', async () => {
    const r = await call('where_is', { handle: 'livedot.me/thandi', units: 'imperial' }), t = r.content[0].text;
    assert.match(t, /Thandi M\. is at mile \d+ of \d+ mi/); assert.match(t, /mph/); assert.ok(!/km\/h/.test(t)); assert.match(t, SPONSOR);
  });
  await test('ChatGPT\'s user location decides the units when none are passed', async () => {
    const r = await call('where_is', { handle: 'thandi' }, { 'openai/userLocation': { country: 'ZA' }, 'openai/locale': 'en-ZA' }); assert.match(r.content[0].text, /km \d+ of/); assert.ok(!/mile/.test(r.content[0].text));
  });
  await test('no hint: the event\'s country leads, the other in brackets', async () => {
    const r = await call('where_is', { handle: 'thandi' }); assert.match(r.content[0].text, /mile \d+ \(km \d+\)/);
  });
  await test('privacy: a stopped or paused person has no position', async () => {
    const p = await call('find_person', { name_or_handle: 'Megan', event: 'Comrades' }), rows = p._meta['livedot/view'].rows;
    for (const row of rows.filter((x) => ['stopped', 'paused'].includes(x.status))) {
      const r = await call('where_is', { person: row.id }); assert.ok(!r.structuredContent.position); assert.match(r.content[0].text, /can't share where they are/); assert.equal(r._meta['livedot/view'].dot, null);
    }
  });
  await test('event_status: the race, its time, the count and the leaders', async () => {
    const r = await call('event_status', { event: 'Comrades' }), s = r.structuredContent;
    assert.equal(s.view, 'event'); assert.equal(s.on_map, 400); assert.ok(s.leaders.length >= 3); assert.match(r.content[0].text, /under way for/); assert.match(r.content[0].text, SPONSOR);
  });
  await test('the apps\' own demo (real servers): "Where\'s the demo runner in the Comrades?"', async () => {
    const r = await call('find_person', { name_or_handle: 'demo', event: 'Comrades demo' });
    assert.equal(r.structuredContent.view, 'person'); assert.match(r.structuredContent.name, /\(demo\)/);
    const e = await call('event_status', { event: 'Coast Classic demo' }); assert.equal(e.structuredContent.view, 'event');
  });
  await test('event_weather: beyond 10 days, 10 years of records, labelled (NYC Marathon preview)', async () => {
    const r = await call('event_weather', { event: 'NYC Marathon' }), s = r.structuredContent, t = r.content[0].text;
    assert.equal(s.view, 'event_weather'); assert.equal(s.basis, 'historic'); assert.match(t, /Based on 10 years of weather on this date/); assert.match(t, /livedot\.me\/guides\/nyc-marathon-2026-weather\//); assert.match(t, SPONSOR);
    assert.ok(['good', 'fair', 'tough'].includes(s.days[0].rating)); assert.equal(r._meta['livedot/view'].kind, 'weather'); assert.ok(r._meta['livedot/view'].stops.length);
  });
  await test('event_weather: inside 10 days, the forecast (Comrades demo; Gravel Burn by stage)', async () => {
    const r = await call('event_weather', { event: 'Comrades demo' }), s = r.structuredContent;
    assert.equal(s.basis, 'forecast'); assert.match(r.content[0].text, /Forecast from Apple Weather/); assert.ok(s.days[0].heat_stress !== undefined);
    // the forecast's age on every ask, also the second within 30 minutes (served from the memo: the read's own fetch time kept with it)
    assert.ok(s.forecast_updated, 'no forecast time'); assert.match(r._meta['livedot/view'].updated, /^Forecast updated \d+ min ago · Apple Weather$/); assert.match(r.content[0].text, /Forecast updated \d+ min ago\./);
    const r2 = await call('event_weather', { event: 'Comrades demo' }); assert.equal(r2.structuredContent.forecast_updated, s.forecast_updated); assert.match(r2._meta['livedot/view'].updated, /^Forecast updated \d+ min ago/); assert.match(r2.content[0].text, /Forecast updated \d+ min ago\./);
    const g = await call('event_weather', { event: 'Gravel Burn', units: 'metric' }); assert.ok(g.structuredContent.days.length >= 6, 'stages'); assert.match(g.content[0].text, /Stage|to /);
  });
  await test('fly_route: "Fly the Comrades" (the demo course), with the weather and the links', async () => {
    const r = await call('fly_route', { event_or_route: 'Comrades' }), v = r._meta['livedot/view'];
    assert.equal(r.structuredContent.view, 'fly_route'); assert.equal(v.kind, 'fly'); assert.ok(v.legs.length > 5); assert.ok(v.fly.url); assert.match(r.content[0].text, /Fly it in 3D: https:/); assert.match(r.content[0].text, SPONSOR);
    const n = await call('fly_route', { event_or_route: 'NYC Marathon' }); assert.match(n.content[0].text, /livedot\.me\/guides\/nyc-marathon/);
  });
  await test('tour_route by organiser ("Alistair\'s Durban tour"): the days, the weather, route files on', async () => {
    const r = await call('tour_route', { tour: 'Alistair\'s Durban tour' }), t = r.content[0].text, s = r.structuredContent;
    assert.equal(s.view, 'tour_route'); assert.equal(s.route_files, true); assert.match(t, /Day 1: Pietermaritzburg to Hillcrest/); assert.match(t, /- Day 1: https:\/\/windline\.tech\/api\/event\/tour\/alistairs-durban-tour-2027\/day\/1\.gpx/); assert.match(t, /- Day 2: .*\/day\/2\.gpx/); assert.equal(s.gpx.length, 2); assert.match(t, /Based on 10 years/); assert.match(t, SPONSOR);
    const a = await call('tour_route', { tour: 'AllyCat' }); assert.match(a.content[0].text, /The organiser hasn't made the route files available\./); assert.equal(a.structuredContent.route_files, false); assert.ok(!/\.gpx/.test(JSON.stringify(a)));
  });
  await test('tour_notes (beta): the organiser\'s words, quoted; none written: said so', async () => {
    const r = await call('tour_notes', { tour: 'Alistair\'s Durban Tour 2027', question: 'What should I pack?' }); assert.match(r.content[0].text, /> - Two bidons/); assert.match(r.content[0].text, /last updated 15 October 2026/); assert.match(r.content[0].text, /own words/); assert.match(r.content[0].text, SPONSOR);
    const n = await call('tour_notes', { tour: 'AllyCat Winelands Tour' }); assert.match(n.content[0].text, /hasn't written any notes/);
  });
  await test('event_weather: an event livedot hasn\'t got', async () => {
    const r = await call('event_weather', { event: 'Tour de Nowhere' }); assert.match(r.content[0].text, /don't have/);
  });
  await test('sign-in: write tools need an account; read tools and plan_route don’t', async () => {
    const t = (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).body.result.tools;
    assert.equal(t.length, 14); const by = Object.fromEntries(t.map((x) => [x.name, x]));
    ['find_person', 'where_is', 'plan_route'].forEach((n) => assert.equal(by[n].securitySchemes[0].type, 'noauth'));
    assert.deepEqual(by.create_event.securitySchemes, [{ type: 'oauth2', scopes: ['events.write'] }]); assert.equal(by.publish_event.annotations.destructiveHint, true); assert.equal(by.list_my_events.annotations.readOnlyHint, true);
    assert.match(by.publish_event.description, /ALWAYS ask the user to confirm/);
    const r = await postRaw({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'create_event', arguments: { type: 'tour', name: 'x' } } });
    assert.equal(r.status, 401); assert.match(r.headers.get('WWW-Authenticate'), /resource_metadata="https:\/\/livedot\.me\/\.well-known\/oauth-protected-resource\/mcp", scope="events\.write"/);
    const c = await call('list_my_events', {}, { 'openai/locale': 'en-ZA' }); assert.equal(c.isError, true); assert.match(c._meta['mcp/www_authenticate'][0], /scope="events\.read"/);
  });
  await test('a signed-in write: the routes read, the time zone from where it starts, the token passed on, the sponsor line', async () => {
    const gpx = `<gpx><trk><trkseg>${Array.from({ length: 40 }, (_, i) => `<trkpt lat="${(-33.92 + i * 0.002).toFixed(4)}" lon="${(18.42 + i * 0.002).toFixed(4)}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
    const r = await postRaw({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_event', arguments: { type: 'tour', name: 'Cape Coast', days: [{ gpx, start: '2027-03-06 06:00' }, { gpx, start: '2027-03-07 06:30' }] } } }, { Authorization: 'Bearer good-token' });
    const j = await r.json(); assert.equal(r.status, 200); assert.match(j.result.content[0].text, /^Did create_event\./); assert.match(j.result.content[0].text, SPONSOR);
    const seen = await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json(), a = seen[seen.length - 1].args;
    assert.equal(a.tz, 'Africa/Johannesburg'); assert.equal(a.days.length, 2); assert.equal(a.days[0].start, '2027-03-06T04:00:00.000Z'); assert.equal(a.days[1].start, '2027-03-07T04:30:00.000Z'); assert.equal(a.days[0].pts.length, 40);
    const bad = await postRaw({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_my_events', arguments: {} } }, { Authorization: 'Bearer expired' });
    assert.equal(bad.status, 401); assert.match(bad.headers.get('WWW-Authenticate'), /error="invalid_token"/);
    // the draft's card: the days, the whole route coloured day by day, Draft · Publish when you're ready, Open in Windline (the dashboard)
    const g2 = (from, to, climb, lat) => `<gpx><trk><name>${from} → ${to}</name><desc>climb=${climb}</desc><trkseg>${Array.from({ length: 50 }, (_, i) => `<trkpt lat="${(lat + i * 0.003).toFixed(4)}" lon="${(22.1 + i * 0.006).toFixed(4)}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
    const d = await postRaw({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'create_event', arguments: { type: 'tour', name: 'Garden Route Classic', days: [{ gpx: g2('Mossel Bay', 'George', 651, -34.18), start: '2027-03-06 07:00', label: 'Day 1' }, { gpx: g2('George', 'Knysna', 1336, -34.03), start: '2027-03-07 07:00', label: 'Day 2' }] } } }, { Authorization: 'Bearer good-token' });
    const dj = (await d.json()).result, v = dj._meta['livedot/view'];
    assert.equal(v.kind, 'draft'); assert.equal(v.statusWord, 'Draft'); assert.equal(v.name, 'Garden Route Classic'); assert.match(v.race, /^Tour · 2 days · \d+ km$/);
    assert.equal(v.updated, 'Draft · Publish when you’re ready'); assert.deepEqual(v.follow, { url: 'https://app.windline.tech/#/e/ev1', label: 'Open in Windline' });
    assert.equal(v.stops.length, 2); assert.equal(v.stops[0][0], 0); assert.ok(v.stops[1][0] > 0.3 && v.stops[1][0] < 0.7); assert.deepEqual(v.key.map((k) => k[1]), ['Day 1', 'Day 2']); assert.ok(v.course.length >= 98);
    assert.equal(v.ahead[1].k, 'Day 2 · George → Knysna'); assert.equal(v.ahead[1].at, '7:00'); assert.match(v.ahead[1].sub, /^1,336 m up · Sun 7 Mar$/); assert.match(v.headline, /· 1,987 m up$/);
    assert.deepEqual(v.stats.map((x) => x.k), ['First day', 'Last day', 'Distance', 'Climbing']); assert.equal(v.stats[0].sub, '6 Mar 2027'); assert.equal(v.stats[3].v, '1,987 m');
    const ce = (await post({ jsonrpc: '2.0', id: 7, method: 'tools/list' })).body.result.tools.find((x) => x.name === 'create_event');
    assert.equal(ce._meta.ui.resourceUri, 'ui://livedot/live-map.html'); assert.equal(ce._meta['openai/outputTemplate'], 'ui://livedot/live-map.html'); assert.deepEqual(ce._meta.securitySchemes, [{ type: 'oauth2', scopes: ['events.write'] }]);
    // a club ride gets the same card: one route, weekly, Group ride
    const cr = (await (await postRaw({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'post_club_ride', arguments: { page: 'acme-cc', name: 'Saturday coffee ride', gpx: g2('Sea Point', 'Camps Bay', 412, -33.92), start: '2027-03-06 06:30', weekly: { days: [6], time: '06:30' } } } }, { Authorization: 'Bearer good-token' })).json()).result, cv = cr._meta['livedot/view'];
    assert.equal(cv.kind, 'draft'); assert.match(cv.race, /^Group ride · \d+ km$/); assert.equal(cv.key, null); assert.equal(cv.stops.length, 1); assert.equal(cv.ahead[0].k, 'Sea Point → Camps Bay'); assert.equal(cv.ahead[0].at, '6:30');
    assert.equal(cv.stats[0].k, 'Start'); assert.match(cv.stats[0].sub, /^Every week from 6 Mar$/); assert.equal(cv.follow.label, 'Open in Windline'); assert.equal(cv.updated, 'Draft · Publish when you’re ready');
    const pc = (await post({ jsonrpc: '2.0', id: 9, method: 'tools/list' })).body.result.tools.find((x) => x.name === 'post_club_ride'); assert.equal(pc._meta.ui.resourceUri, 'ui://livedot/live-map.html'); assert.deepEqual(pc._meta.securitySchemes, [{ type: 'oauth2', scopes: ['clubs.post'] }]);
    const pub = await postRaw({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'publish_event', arguments: { event_id: 'ev1', confirm: true } } }, { Authorization: 'Bearer good-token' });
    const pj = await pub.json(); const last = (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).pop(); assert.equal(last.args.id, 'ev1'); assert.equal(last.args.event_id, 'ev1'); assert.ok(pj.result);
  });
  await test('plan_route: no account, the weather along a pasted route at its time, with the map', async () => {
    const gpx = `<gpx><trk><trkseg>${Array.from({ length: 60 }, (_, i) => `<trkpt lat="${(-29.75 + i * 0.004).toFixed(4)}" lon="${(30.5 + i * 0.006).toFixed(4)}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
    const start = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) + ' 06:00';
    const r = await call('plan_route', { gpx, start, sport: 'run' }); assert.equal(r.structuredContent.view, 'plan_route'); assert.equal(r.structuredContent.tz, 'Africa/Johannesburg'); assert.match(r.content[0].text, /Forecast from Apple Weather/); assert.ok(r._meta['livedot/view'].course.length > 10); assert.match(r.content[0].text, SPONSOR);
    const s = await call('plan_route', { url: 'https://www.strava.com/routes/1', start }); assert.equal(s.isError, true); assert.match(s.content[0].text, /Strava/);
  });
  await test('OAuth metadata (RFC 9728, RFC 8414)', async () => {
    const O = await import('../src/oauth.js'), req = new Request('https://livedot.me/.well-known/oauth-protected-resource/mcp');
    const pr = await O.protectedResource(req).json(); assert.equal(pr.resource, 'https://livedot.me/mcp'); assert.deepEqual(pr.authorization_servers, ['https://livedot.me']);
    const as = await O.authorizationServer(req).json(); assert.equal(as.issuer, 'https://livedot.me'); assert.deepEqual(as.code_challenge_methods_supported, ['S256']); assert.equal(as.registration_endpoint, 'https://livedot.me/oauth/register');
  });
  await test('event_status: a leader whose position is hidden (near the finish) shows with no km (KPMG C2)', async () => {
    const r = await call('event_status', { event: 'Comrades' }), t = r.content[0].text, s = r.structuredContent, lf = s.leaders.find((x) => x.name === 'Lerato F.');
    assert.ok(lf, 'the leader is listed'); assert.equal(lf.km, null); assert.equal(lf.where, 'on the course');
    assert.match(t, /Out front: Lerato F\., on the course\./); assert.ok(!/Lerato F\. \((km|mile)/.test(t));
    const v = r._meta['livedot/view']; assert.ok(v.leaders.find((x) => x.k === 'Lerato F.').v === 'on the course');
  });
  await test('nobody: an honest answer with the findable rule', async () => {
    const r = await call('find_person', { name_or_handle: 'Zebedee Quux' }); assert.match(r.content[0].text, /findable/); assert.match(r.content[0].text, SPONSOR);
    const h = await call('where_is', { handle: 'nobody-here' }); assert.match(h.content[0].text, /no one at livedot\.me\/nobody-here/);
  });
  await test('no uid, email or phone anywhere', async () => {
    const r = JSON.stringify(await call('find_person', { name_or_handle: 'Megan', event: 'Comrades' })) + JSON.stringify(await call('event_status', { event: 'Coast Classic' }));
    assert.ok(!/@|"uid"|email|phone/i.test(r.replace(/livedot\.me\/@?/g, '')));
  });
  await test('Smithery quality: every tool has a title, annotations, an outputSchema and described parameters', async () => {
    const t = (await post({ jsonrpc: '2.0', id: 90, method: 'tools/list' })).body.result.tools;
    for (const x of t) {
      assert.ok(x.title && x.description, x.name + ': title/description'); assert.ok(x.annotations && typeof x.annotations.readOnlyHint === 'boolean', x.name + ': annotations');
      assert.equal(x.outputSchema && x.outputSchema.type, 'object', x.name + ': outputSchema'); assert.ok(x.outputSchema.properties.view, x.name + ': view');
      for (const [k, d] of Object.entries(x.inputSchema.properties)) assert.ok(d.description && d.description.length > 3, `${x.name}.${k}: no description`);
    }
    const i = (await post({ jsonrpc: '2.0', id: 91, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).body.result;
    assert.ok(i.capabilities.prompts); assert.ok(i.serverInfo.description.length > 20); assert.ok(i.serverInfo.icons.length === 2); assert.match(i.serverInfo.websiteUrl, /^https:\/\/livedot\.me/);
  });
  await test('prompts: list, get, unknown, missing argument', async () => {
    const l = (await post({ jsonrpc: '2.0', id: 92, method: 'prompts/list' })).body.result.prompts;
    assert.deepEqual(l.map((x) => x.name), ['track_someone', 'race_day_weather', 'fly_a_course']); assert.ok(l.every((x) => x.title && x.description && !x.text));
    const g = (await post({ jsonrpc: '2.0', id: 93, method: 'prompts/get', params: { name: 'track_someone', arguments: { person: 'Megan', race: 'the Comrades' } } })).body.result;
    assert.equal(g.messages[0].role, 'user'); assert.match(g.messages[0].content.text, /^Where's Megan in the Comrades right now\?/);
    const w = (await post({ jsonrpc: '2.0', id: 94, method: 'prompts/get', params: { name: 'race_day_weather', arguments: { event: 'NYC Marathon' } } })).body.result; assert.match(w.messages[0].content.text, /NYC Marathon\?/);
    assert.equal((await post({ jsonrpc: '2.0', id: 95, method: 'prompts/get', params: { name: 'nope' } })).body.error.code, -32602);
    assert.match((await post({ jsonrpc: '2.0', id: 96, method: 'prompts/get', params: { name: 'fly_a_course', arguments: {} } })).body.error.message, /Missing argument: event/);
  });
  await test('resources: the live map and the guide; an unknown one is a clean error', async () => {
    const l = (await post({ jsonrpc: '2.0', id: 97, method: 'resources/list' })).body.result.resources; assert.deepEqual(l.map((x) => x.uri), ['ui://livedot/live-map.html', 'livedot://guide']);
    const g = (await post({ jsonrpc: '2.0', id: 98, method: 'resources/read', params: { uri: 'livedot://guide' } })).body.result.contents[0]; assert.equal(g.mimeType, 'text/markdown'); assert.match(g.text, /find_person/);
    assert.equal((await post({ jsonrpc: '2.0', id: 99, method: 'resources/read', params: { uri: 'livedot://nope' } })).body.error.code, -32002);
  });
  await test('clean errors: a missing argument, bad arguments, an unknown tool or method, all fast', async () => {
    const t0 = Date.now();
    const m = (await post({ jsonrpc: '2.0', id: 100, method: 'tools/call', params: { name: 'event_weather', arguments: {} } })).body.result;
    assert.equal(m.isError, true); assert.equal(m.content[0].text, 'event_weather needs event.');
    const b = (await post({ jsonrpc: '2.0', id: 101, method: 'tools/call', params: { name: 'event_weather', arguments: 'Comrades' } })).body; assert.equal(b.error.code, -32602);
    assert.equal((await post({ jsonrpc: '2.0', id: 102, method: 'tools/call', params: { name: 'nope', arguments: {} } })).body.error.code, -32602);
    assert.equal((await post({ jsonrpc: '2.0', id: 103, method: 'nope/nope' })).body.error.code, -32601);
    assert.ok(Date.now() - t0 < 200, 'errors should not wait on any read');
  });
  await test('the server card: the same tools, prompts and resources as the server', async () => {
    const c = serverCard('https://livedot.me'); assert.equal(c.serverInfo.name, 'livedot'); assert.equal(c.transport.endpoint, 'https://livedot.me/mcp');
    assert.equal(c.tools.length, TOOLS.length); assert.equal(c.prompts.length, 3); assert.equal(c.resources.length, 2); assert.equal(c.authentication.required, false);
    const { onRequestGet } = await import('../../functions/.well-known/mcp/[[path]].js');
    const r = onRequestGet({ request: new Request('https://livedot.me/.well-known/mcp/server-card.json'), params: { path: ['server-card.json'] } });
    assert.equal(r.status, 200); assert.equal((await r.json()).tools.length, TOOLS.length);
    assert.equal(onRequestGet({ request: new Request('https://livedot.me/.well-known/mcp/x'), params: { path: ['x'] } }).status, 404);
  });
  await test('HTTP: GET page, SSE 405, CORS preflight, parse error', async () => {
    let r = await handle(new Request('https://livedot.me/mcp'), env); assert.equal(r.status, 200); const html = await r.text(); assert.match(html, /Live race tracking, in ChatGPT and Claude/); assert.match(html, /proudly brought to you free thanks to/); assert.ok(!r.headers.get('X-Robots-Tag'), 'indexable on livedot.me'); assert.ok(!/mailto:/.test(html));
    r = await handle(new Request('https://livedot.me/mcp', { headers: { Accept: 'text/event-stream' } }), env); assert.equal(r.status, 405);
    r = await handle(new Request('https://livedot.me/mcp', { method: 'OPTIONS' }), env); assert.equal(r.status, 204); assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
    r = await handle(new Request('https://livedot.me/mcp', { method: 'POST', body: '{' }), env); assert.equal(r.status, 400);
  });
} finally { fx.kill(); }

function MOVINGFIRST(rows) { const m = rows.map((r) => ['live', 'delayed', 'nosignal'].includes(r.status)); return m.indexOf(false) === -1 || m.slice(m.indexOf(false)).every((x) => !x); }
