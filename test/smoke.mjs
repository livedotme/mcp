// The server, end to end, on sample data (test/fixture-api.mjs) and the apps' public demos: every method, every tool, the privacy
// rule, units, and the picker. Forecasts come from Windline's forecast store, as in production.
//   node test/smoke.mjs            (starts the fixture API itself)
//   node test/smoke.mjs --show     prints each tool's text answer
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { handle, TOOLS, serverCard, missOf } from '../src/server.js';
import { rankPlaces, placeHint } from '../src/discover.js';
import { parseMembers } from '../src/members.js';
import { BUILD } from '../src/gen/build.js';
const WURI = `ui://livedot/live-map.${BUILD}.html`;

const DIR = path.dirname(fileURLToPath(import.meta.url)), PORT = 8790 + Math.floor(Math.random() * 100);
const fx = spawn(process.execPath, [path.join(DIR, 'fixture-api.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok) => fx.stdout.once('data', ok));
const env = { WINDLINE_API: `http://localhost:${PORT}/windline`, RUNFAST_API: `http://localhost:${PORT}/runfast`, MCP_AUTH_API: `http://localhost:${PORT}/windline/api/mcp`, MCP_PROXY_SECRET: 'test-proxy' }, SHOW = process.argv.includes('--show');
let n = 0;
// the towns at a route's ends (Photon, as the dashboard): stubbed here by latitude, so the tests never depend on it
const TOWNS = [[-34.18, 'Mossel Bay'], [-34.08, 'George'], [-33.98, 'Wilderness'], [-33.88, 'Knysna'], [-33.78, 'Plettenberg Bay'], [-33.68, 'Storms River']];
const realFetch = globalThis.fetch, PHOTON = [], PHOTON_Q = [];
// find_clubs / find_events: a place's name to a point (Photon's search), stubbed the same way
const PLACES = { fourways: [-26.0106, 28.0104, 'Fourways', 'suburb'], johannesburg: [-26.2041, 28.0473, 'Johannesburg', 'city'], 'cape town': [-33.9249, 18.4241, 'Cape Town', 'city'] };
globalThis.fetch = (u, o) => { const s = String(u && u.url || u); if (!s.startsWith('https://photon.komoot.io/')) return realFetch(u, o); const q = new URL(s), lat = +q.searchParams.get('lat');
  if (q.pathname === '/api/') { PHOTON_Q.push(s); const fx = path.join(DIR, 'fixtures', 'photon', String(q.searchParams.get('q')).toLowerCase().replace(/\s+/g, '-') + '.json'); // Photon's real answers, recorded (test/fixtures/photon)
    if (!PLACES[String(q.searchParams.get('q')).toLowerCase()] && fs.existsSync(fx)) return Promise.resolve(new Response(fs.readFileSync(fx, 'utf8'), { headers: { 'Content-Type': 'application/json' } }));
    const P = PLACES[String(q.searchParams.get('q')).toLowerCase()]; return Promise.resolve(new Response(JSON.stringify({ features: P ? [{ geometry: { coordinates: [P[1], P[0]] }, properties: { name: P[2], city: 'Johannesburg', country: 'South Africa', countrycode: 'ZA', osm_key: 'place', osm_value: P[3] } }] : [] }), { headers: { 'Content-Type': 'application/json' } })); }
  PHOTON.push(s); // the town lookups only (a route's ends)
  const t = TOWNS.reduce((b, x) => (Math.abs(x[0] - lat) < Math.abs(b[0] - lat) ? x : b)); return Promise.resolve(new Response(JSON.stringify({ features: [{ properties: { name: t[1], osm_value: 'town' } }] }), { headers: { 'Content-Type': 'application/json' } })); };
const postRaw = (body, h = {}) => handle(new Request('https://livedot.me/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...h }, body: JSON.stringify(body) }), env);
const post = async (body, h = {}) => { const r = await handle(new Request('https://livedot.me/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...h }, body: JSON.stringify(body) }), env); return { status: r.status, body: r.status === 202 ? null : await r.json() }; };
const call = async (name, args, meta) => { const r = await post({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } }); assert.equal(r.status, 200); assert.ok(r.body.result, JSON.stringify(r.body)); const t = r.body.result.content[0].text; if (SHOW) console.log(`\n--- ${name} ${JSON.stringify(args)}${meta ? ' ' + JSON.stringify(meta) : ''}\n${t}`); conforms(name, r.body.result); return r.body.result; };
// every answer that isn't an error matches its tool's outputSchema (what a client that checks structuredContent will do)
const TYPE = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const fits = (v, t) => [].concat(t).some((x) => x === TYPE(v) || (x === 'number' && TYPE(v) === 'integer'));
function conforms(name, res) {
  assert.match(res.content[0].text, SPONSOR, name + ': the answer doesn\'t end with the sponsor line');
  const o = TOOLS.find((x) => x.name === name).outputSchema; if (res.isError) return;
  const s = res.structuredContent; assert.ok(s && TYPE(s) === 'object', name + ': no structuredContent');
  (o.required || []).forEach((k) => assert.ok(k in s, `${name}: ${k} missing`));
  for (const [k, d] of Object.entries(o.properties)) { if (!(k in s)) continue; if (d.type) assert.ok(fits(s[k], d.type), `${name}.${k}: ${TYPE(s[k])} is not ${d.type}`); if (d.enum) assert.ok(d.enum.includes(s[k]), `${name}.${k}: ${s[k]} not in ${d.enum}`); }
}
const SPONSOR = /Live tracking, proudly brought to you free thanks to (\w+|\[\w+\]\(https:\/\/[^)\s]+\))\.$/; // the sponsor's name links to them (Wes, 17 Oct)
const test = async (name, fn) => { try { await fn(); console.log('ok  ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } };

try {
  await test('initialize, list, read the widget', async () => {
    const i = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(i.body.result.protocolVersion, '2025-06-18'); assert.equal(i.body.result.serverInfo.title, 'livedot MCP');
    assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const t = (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body.result.tools;
    assert.deepEqual(t.map((x) => x.name), ['find_person', 'where_is', 'event_status', 'club_in_race', 'event_weather', 'fly_route', 'tour_route', 'tour_notes', 'tap_on_the_back', 'find_clubs', 'find_events', 'plan_route', 'list_my_events', 'create_event', 'update_event', 'add_tour_notes', 'publish_event', 'post_club_ride', 'invite_members']);
    t.forEach((x) => assert.ok(!/word for word/.test(x.description), 'a repeat-this instruction')); t.filter((x) => !['tour_notes', 'list_my_events', 'create_event', 'update_event', 'add_tour_notes', 'publish_event', 'post_club_ride', 'plan_route', 'tap_on_the_back', 'invite_members'].includes(x.name)).forEach((x) => { assert.equal(x._meta.ui.resourceUri, WURI); assert.equal(x.annotations.readOnlyHint, true); assert.match(x.inputSchema.properties.units.description, /imperial for users in the US/); });
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
    const v = r._meta['livedot/view']; assert.equal(v.kind, 'picker'); assert.equal(v.rows.length, 20); assert.ok(v.rows.every((x) => /^Megan \S{2,}/.test(x.name) && !/^Megan [A-Z]\.$/.test(x.name)), "Findable people by their full name (Wes, 17 Oct)");
    assert.ok(MOVINGFIRST(v.rows), 'live first');
    const looks = v.rows.map((x) => [x.name, x.where, x.pace, x.goal, x.extra, x.handle].join('|')); assert.equal(new Set(looks).size, looks.length, 'two rows look the same');
  });
  await test('narrowing by surname: one Megan, answered at once', async () => {
    const r = await call('find_person', { name_or_handle: 'Megan', event: 'Comrades', surname: 'Bot' });
    assert.equal(r.structuredContent.view, 'person'); assert.equal(r.structuredContent.name, 'Megan Botha');
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
    assert.match(t, /Thandi Mokoena is at mile \d+ of \d+ mi/); assert.match(t, /mph/); assert.ok(!/km\/h/.test(t)); assert.match(t, SPONSOR);
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
    assert.ok(s.forecast_updated, 'no forecast time'); assert.match(r._meta['livedot/view'].updated, /^Forecast updated (\d+ h )?\d+ min ago · Apple Weather$/); assert.match(r.content[0].text, /Weather: \[Apple Weather\]\(https:\/\/weatherkit\.apple\.com\/legal-attribution\.html\) \(updated (\d+ h )?\d+ min ago\)\./);
    const r2 = await call('event_weather', { event: 'Comrades demo' }); assert.equal(r2.structuredContent.forecast_updated, s.forecast_updated); assert.match(r2._meta['livedot/view'].updated, /^Forecast updated (\d+ h )?\d+ min ago/); assert.match(r2.content[0].text, /Weather: \[Apple Weather\]\(https:\/\/weatherkit\.apple\.com\/legal-attribution\.html\) \(updated (\d+ h )?\d+ min ago\)\./);
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
  await test('find_clubs: "best running club to join in Fourways": nearest first, sessions, beginners, Join to the page, never a person', async () => {
    const r = await call('find_clubs', { place: 'Fourways' }), s = r.structuredContent, t = r.content[0].text;
    assert.equal(s.view, 'clubs'); assert.equal(s.place, 'Fourways, Johannesburg, South Africa'); assert.equal(s.km, 25);
    assert.deepEqual(s.clubs.map((c) => c.name), ['Fourways Striders', 'Fourways Wheelers', 'Jozi Trail Runners', 'Jozi Tours']); // both apps, nearest first (ties by name)
    const fw = s.clubs.find((c) => c.name === 'Fourways Wheelers');
    assert.equal(fw.join, 'https://livedot.me/fourways-wheelers#join-cycling'); assert.equal(fw.url, 'https://livedot.me/fourways-wheelers#cycling'); // livedot.me/<slug> is every club's public address assert.equal(fw.sessions, 'Tue 17:30 from Fourways Mall · Sat 06:00 from Fourways'); assert.equal(fw.beginners_welcome, true); assert.equal(fw.pace_groups, '25–30 km/h');
    assert.match(t, /^Clubs near Fourways/); assert.match(t, /Join: https:\/\/livedot\.me\/fourways-striders#join-running/); assert.ok(!/(windline|runfast)\.tech\/c\//.test(t), 'an app address for a club'); assert.match(t, /Beginners welcome; pace groups 5:30–7:00 \/km\./); assert.match(t, /create your account/);
    assert.ok(!/admins|managers|uid/i.test(JSON.stringify(r)), 'something about people');
    const v = r._meta['livedot/view']; assert.equal(v.kind, 'list'); assert.equal(v.items.length, 4); assert.equal(v.items[0].button.label, 'Join'); assert.equal(v.items[0].button.url, 'https://livedot.me/fourways-striders#join-running'); assert.equal(v.items[0].url, 'https://livedot.me/fourways-striders#running'); assert.ok(v.cta && v.sponsor);
    assert.match(t, /Run a club that isn't listed\? Add it free: cycling https:\/\/windline\.tech\/pages\/\?from=livedot-mcp#apply · running https:\/\/runfast\.tech\/app\/\?ref=livedot-mcp#\/clubs\/add/); assert.equal(v.add.label, 'Is your club missing? Add it free'); assert.ok(s.add_club.cycling && s.add_club.running);
  });
  await test('find_clubs: running, beginners: one app, the RunFast account line', async () => {
    const r = await call('find_clubs', { place: 'fourways', sport: 'running', beginners: true }), s = r.structuredContent;
    assert.deepEqual(s.clubs.map((c) => c.name), ['Fourways Striders']); assert.equal(s.app, 'runfast'); assert.equal(s.signup.url, 'https://runfast.tech/app/?ref=mcp#/signup');
    assert.match(r.content[0].text, /^Beginner-friendly road running clubs|^Beginner-friendly running clubs/); assert.equal(r._meta['livedot/view'].sport, 'run');
  });
  await test('find_clubs: "open to anyone" (open), Members only in words, Club links (https only, Biotree from the hostname)', async () => {
    let r = await call('find_clubs', { place: 'Fourways' }), s = r.structuredContent, t = r.content[0].text, v = r._meta['livedot/view'];
    const by = (n) => s.clubs.find((c) => c.name === n), item = (n) => v.items.find((x) => x.name === n);
    assert.equal(by('Fourways Wheelers').open_to_all, true); assert.equal(by('Fourways Striders').open_to_all, false); assert.equal(by('Jozi Tours').open_to_all, null);
    assert.deepEqual(item('Fourways Wheelers').tags.slice(0, 2), ['Open to anyone', 'Beginners welcome']); assert.ok(!item('Fourways Striders').tags.includes('Members only')); // no loud pill for members only
    assert.match(t, /Fourways Wheelers[^\n]*Open to anyone; Beginners welcome; pace groups 25–30 km\/h\./); assert.match(t, /Fourways Striders[^\n]*Members only; Beginners welcome/);
    assert.deepEqual(by('Fourways Wheelers').links, { url: 'https://fourways-wheelers.biotree.bio/', biotree: true }); assert.equal(by('Fourways Striders').links.biotree, false); assert.equal(by('Jozi Trail Runners').links, null);
    assert.match(t, /Club links: https:\/\/fourways-wheelers\.biotree\.bio\//); assert.ok(!/jozi-trail\.example/.test(t)); assert.ok(!/areaSource|area_source/.test(JSON.stringify(s.clubs)), 'area source shown');
    r = await call('find_clubs', { place: 'Fourways', open: true }); s = r.structuredContent;
    assert.deepEqual(s.clubs.map((c) => c.name), ['Fourways Wheelers', 'Jozi Trail Runners']); assert.equal(s.open, true); assert.match(r.content[0].text, /^Open-to-anyone clubs near Fourways/);
    r = await call('find_clubs', { place: 'Fourways', open: true, beginners: true }); assert.deepEqual(r.structuredContent.clubs.map((c) => c.name), ['Fourways Wheelers']);
    const tool = (await post({ jsonrpc: '2.0', id: ++n, method: 'tools/list' })).body.result.tools.find((x) => x.name === 'find_clubs'); assert.equal(tool.inputSchema.properties.open.type, 'boolean'); assert.match(tool.description, /open to anyone/);
  });
  await test('a place by name (17 Oct, "Lanseria" landed in France): the best name match, airports and nature reserves as points, the asker\'s country first; two countries level with no hint: ask', async () => {
    const F = (n) => JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures', 'photon', n + '.json'), 'utf8')).features, ZA = placeHint({ 'openai/locale': 'en-ZA' }), US = placeHint({ 'openai/userLocation': { country: 'US', latitude: 40.01, longitude: -105.27 } });
    for (const [n, q, cc, name] of [['lanseria', 'Lanseria', 'ZA', 'Lanseria International Airport'], ['fourways', 'Fourways', 'ZA', 'Fourways'], ['sandton', 'Sandton', 'ZA', 'Sandton'], ['durban-north', 'Durban North', 'ZA', 'Durban North'],
      ['cradle-of-humankind', 'Cradle of Humankind', 'ZA', 'Maropeng Cradle of Humankind'], ['stellenbosch', 'Stellenbosch', 'ZA', 'Stellenbosch'], ['paris', 'Paris', 'FR', 'Paris'], ['boulder', 'Boulder', 'US', 'Boulder'],
      ['johannesburg', 'Johannesburg', 'ZA', 'Johannesburg'], ['durban', 'Durban', 'ZA', 'Durban'], ['london', 'London', 'GB', 'London']]) { // a big city beats an island, a village, a station or a smaller city of the same name (18 Oct)
      for (const h of [null, ZA]) { const r = rankPlaces(F(n), q, h); assert.ok(r && r.pick, `${q} (${h ? 'ZA' : 'no'} hint): ${JSON.stringify(r && r.ask)}`); assert.equal(r.pick.country, cc, `${q} (${h ? 'ZA' : 'no'} hint)`); assert.equal(r.pick.name, name, q); }
    }
    assert.equal(rankPlaces(F('boulder'), 'Boulder', US).pick.state, 'Colorado'); assert.equal(rankPlaces(F('lanseria'), 'Lanseria', placeHint({ 'openai/locale': 'fr-FR' })).pick.country, 'FR'); // someone in France means the one in France
    const two = [['US', 'United States', 'Illinois', -89.6, 39.8], ['AU', 'Australia', 'Queensland', 153.0, -27.7]].map(([cc, c, st, lo, la]) => ({ geometry: { coordinates: [lo, la] }, properties: { name: 'Springfield', osm_key: 'place', osm_value: 'city', countrycode: cc, country: c, state: st } }));
    assert.deepEqual(rankPlaces(two, 'Springfield', null).ask, ['Springfield, Illinois, United States', 'Springfield, Queensland, Australia']); assert.equal(rankPlaces(two, 'Springfield', ZA).pick.country, 'US');
    const r = await call('find_clubs', { place: 'Lanseria', sport: 'cycling' }), t = r.content[0].text; assert.match(t, /Lanseria \(airport area\), Gauteng, South Africa/); assert.ok(!/France|Landébia/.test(t), t.slice(0, 200));
    const n0 = PHOTON_Q.length; await call('find_events', { place: 'Lanseria' }, { 'openai/userLocation': { country: 'ZA', latitude: -26.0123, longitude: 28.0456 } });
    const u = new URL(PHOTON_Q[n0]); assert.equal(u.searchParams.get('lat'), '-26.01'); assert.equal(u.searchParams.get('lon'), '28.05'); // the bias, rounded: the asker's point never leaves at full precision
    assert.equal(placeHint({ 'openai/locale': 'en-ZA' }).lat, -29); assert.equal(placeHint({}), null);
  });
  await test('find_events: "cycle tours around Johannesburg": the tour, its organiser, I\'m in', async () => {
    const r = await call('find_events', { place: 'Johannesburg', sport: 'tours' }), s = r.structuredContent;
    assert.equal(s.view, 'events'); assert.deepEqual(s.events.map((e) => e.name), ['Cradle 3-Day']); assert.equal(s.events[0].club, 'Jozi Tours'); assert.equal(s.events[0].join, 'https://windline.tech/o/jozi-tours#join');
    assert.match(r.content[0].text, /^Tours near Johannesburg/); assert.equal(r._meta['livedot/view'].items[0].button.label, 'I\'m in');
  });
  await test('find_events: soonest first, a window from words, a kind', async () => {
    let r = await call('find_events', { place: 'Fourways' }); assert.deepEqual(r.structuredContent.events.map((e) => e.name), ['Saturday Bunch', 'Saturday Long Run', 'Cradle 3-Day']);
    r = await call('find_events', { place: 'Fourways', kind: 'club run' }); assert.deepEqual(r.structuredContent.events.map((e) => e.name), ['Saturday Long Run']);
    r = await call('find_events', { place: 'Fourways', when: 'this week' }); assert.ok(!r.structuredContent.events || !r.structuredContent.events.some((e) => e.name === 'Cradle 3-Day'));
  });
  await test('find_clubs, find_events: none near, a place not on the map: said plainly, and both are misses', async () => {
    let r = await call('find_events', { place: 'Cape Town', sport: 'trail-run', when: 'November' }); assert.equal(r.structuredContent.view, 'none'); assert.match(r.content[0].text, /don't know any public trail running events within 50 km|don't know any public trail running events within 100 km/);
    assert.equal(missOf('find_events', { place: 'Cape Town' }, { structured: r.structuredContent }, [{ app: 'runfast', status: 200 }]).outcome, 'none');
    r = await call('find_clubs', { place: 'Cape Town', sport: 'running' }); assert.equal(r.structuredContent.view, 'none'); assert.match(r.content[0].text, /Add it free: running https:\/\/runfast\.tech\/app\/\?ref=livedot-mcp#\/clubs\/add\n/); // none near: how to be added
    r = await call('find_clubs', { place: 'Nowhereville' }); assert.equal(r.structuredContent.view, 'none'); assert.match(r.content[0].text, /couldn't find "Nowhereville"/);
    assert.equal(missOf('find_clubs', { place: 'Nowhereville' }, { structured: r.structuredContent }, [], 'no_place').q, 'Nowhereville');
  });
  await test('sign-in: write tools need an account; read tools and plan_route don’t', async () => {
    const t = (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).body.result.tools;
    assert.equal(t.length, 19); const by = Object.fromEntries(t.map((x) => [x.name, x]));
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
    assert.equal(ce._meta.ui.resourceUri, WURI); assert.equal(ce._meta['openai/outputTemplate'], WURI); assert.deepEqual(ce._meta.securitySchemes, [{ type: 'oauth2', scopes: ['events.write'] }]);
    // a club ride gets the same card: one route, weekly, Group ride
    const cr = (await (await postRaw({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'post_club_ride', arguments: { page: 'acme-cc', name: 'Saturday coffee ride', gpx: g2('Sea Point', 'Camps Bay', 412, -33.92), start: '2027-03-06 06:30', weekly: { days: [6], time: '06:30' } } } }, { Authorization: 'Bearer good-token' })).json()).result, cv = cr._meta['livedot/view'];
    assert.equal(cv.kind, 'draft'); assert.match(cv.race, /^Group ride · \d+ km$/); assert.equal(cv.key, null); assert.equal(cv.stops.length, 1); assert.equal(cv.ahead[0].k, 'Sea Point → Camps Bay'); assert.equal(cv.ahead[0].at, '6:30');
    assert.equal(cv.stats[0].k, 'Start'); assert.match(cv.stats[0].sub, /^Every week from 6 Mar$/); assert.equal(cv.follow.label, 'Open in Windline'); assert.equal(cv.updated, 'Draft · Publish when you’re ready');
    const pc = (await post({ jsonrpc: '2.0', id: 9, method: 'tools/list' })).body.result.tools.find((x) => x.name === 'post_club_ride'); assert.equal(pc._meta.ui.resourceUri, WURI); assert.deepEqual(pc._meta.securitySchemes, [{ type: 'oauth2', scopes: ['clubs.post'] }]);
    const pub = await postRaw({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'publish_event', arguments: { event_id: 'ev1', confirm: true } } }, { Authorization: 'Bearer good-token' });
    const pj = await pub.json(); const last = (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).pop(); assert.equal(last.args.id, 'ev1'); assert.equal(last.args.event_id, 'ev1'); assert.ok(pj.result);
  });
  await test('plan_route: no account, the weather along a pasted route at its time, with the map', async () => {
    const gpx = `<gpx><trk><trkseg>${Array.from({ length: 60 }, (_, i) => `<trkpt lat="${(-29.75 + i * 0.004).toFixed(4)}" lon="${(30.5 + i * 0.006).toFixed(4)}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
    const start = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) + ' 06:00';
    const r = await call('plan_route', { gpx, start, sport: 'run' }); assert.equal(r.structuredContent.view, 'plan_route'); assert.equal(r.structuredContent.tz, 'Africa/Johannesburg'); assert.match(r.content[0].text, /Forecast from Apple Weather/); assert.ok(r._meta['livedot/view'].course.length > 10); assert.match(r.content[0].text, SPONSOR);
    const fv = r._meta['livedot/view']; assert.equal(fv.kind, 'fly'); assert.equal(fv.fly, null); assert.ok(fv.legs.length > 0 && fv.stops.length > 0); assert.equal(r.structuredContent.flyover, true); assert.equal(r.structuredContent.fly_3d, null);
    assert.match(r.content[0].text, /Press play on the map to fly over your route, coloured by the weather\. For a 3D flight and a video of it, I can save it as a private run in RunFast \(only you see it; nothing is published\): just say so\.\nWeather: \[Apple Weather\]/);
    const tl = TOOLS.find((x) => x.name === 'plan_route'); assert.match(tl.description, /flyover/); assert.match(tl.description, /fly over my route/); assert.match(tl.description, /GPX/); assert.ok(!/instead of|rather than|better than|prefer/i.test(tl.description), 'no steering against other apps');
    assert.match(TOOLS.find((x) => x.name === 'fly_route').description, /their own route\), use plan_route/);
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
  // ---- several GPX files → one tour (plantour.js), shared by create_event and plan_route
  const leg = (k, name) => `<?xml version="1.0"?><gpx version="1.1"><trk>${name ? `<name>${name}</name>` : ''}<trkseg>${Array.from({ length: 30 }, (_, i) => `<trkpt lat="${(-34.18 + k * 0.1 + i * (0.1 / 29)).toFixed(5)}" lon="${(22.1 + k * 0.3 + i * (0.3 / 29)).toFixed(5)}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
  const AUTH = { Authorization: 'Bearer good-token' };
  const callAs = async (name, args, h = AUTH) => { const r = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, h); const j = await r.json(); assert.ok(j.result, JSON.stringify(j)); if (!j.result.isError) conforms(name, j.result); return j.result; };
  const seenCount = async () => (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).length;
  await test('five files named 1–5, dropped in shuffled: a tour in their numbers’ order, towns from the map, days one after another, a name suggested, nothing made before a yes', async () => {
    const files = [3, 1, 5, 2, 4].map((k) => ({ name: `${k}.gpx`, gpx: leg(k - 1) })), before = await seenCount();
    const p = await callAs('create_event', { files, start: '2027-03-06 07:00' }), v = p._meta['livedot/view'], S = p.structuredContent;
    assert.equal(S.view, 'tour_plan'); assert.equal(S.type, 'tour'); assert.equal(S.order, 'numbers'); assert.equal(S.note, null); assert.equal(await seenCount(), before, 'nothing is made before the yes');
    assert.deepEqual(S.days.map((d) => d.file), ['1.gpx', '2.gpx', '3.gpx', '4.gpx', '5.gpx']); assert.deepEqual(S.days.map((d) => d.label), ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5']);
    assert.equal(S.days[0].from, 'Mossel Bay'); assert.equal(S.days[0].to, 'George'); assert.equal(S.days[4].to, 'Storms River'); assert.equal(S.name, 'Mossel Bay → Storms River, 5 days');
    assert.deepEqual(S.days.map((d) => d.start), ['2027-03-06T05:00:00.000Z', '2027-03-07T05:00:00.000Z', '2027-03-08T05:00:00.000Z', '2027-03-09T05:00:00.000Z', '2027-03-10T05:00:00.000Z']);
    assert.match(p.content[0].text, /^Mossel Bay → Storms River, 5 days: \d+ km, \d+ m up, from Sat 6 Mar\. Days in the order of the numbers in the file names\.\nDay 1 · Sat 6 Mar 7:00 · Mossel Bay → George · /);
    assert.match(p.content[0].text, /Nothing is made yet\. Check this with the user/); assert.equal(S.visibility, 'shared');
    assert.equal(v.kind, 'draft'); assert.equal(v.statusWord, 'Plan'); assert.equal(v.follow, null); assert.match(v.updated, /^Plan · Not created yet/); assert.equal(v.key.length, 5);
    assert.ok(PHOTON.every((u) => /lat=-?\d+\.\d{3}&lon=-?\d+\.\d{3}&/.test(u)), 'only the ends, rounded to about 100 m, go to the town lookup');
    // the yes: the same files, confirm: true → the tour, in that order
    const c = await callAs('create_event', { files, start: '2027-03-06 07:00', confirm: true, notes: '# What to pack\nA rain jacket.' }), sent = (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).pop().args;
    assert.equal(sent.type, 'tour'); assert.equal(sent.name, 'Mossel Bay → Storms River, 5 days'); assert.equal(sent.days.length, 5); assert.equal(sent.days[2].from, 'Wilderness'); assert.equal(sent.visibility, 'shared'); assert.equal(sent.notes, '# What to pack\nA rain jacket.');
    assert.ok(sent.days.every((d, i) => !i || Date.parse(d.start) - Date.parse(sent.days[i - 1].start) === 864e5));
    const cv = c._meta['livedot/view']; assert.equal(cv.statusWord, 'Draft'); assert.equal(cv.updated, 'Draft · Publish when you’re ready · Tour notes added');
  });
  await test('files with no numbers: chained by the map (each day starts where the last ended); rest days skipped; a GPX name shared by the files names the tour', async () => {
    const files = [2, 0, 3, 1].map((k) => ({ name: `route-${'abcd'[k]}.gpx`, gpx: leg(k, `Garden Route Classic - ${['Coast', 'Lakes', 'Forest', 'River'][k]}`) }));
    const p = await callAs('create_event', { files, start: '2027-03-06 07:00', rest_days: ['2027-03-08'] }), S = p.structuredContent;
    assert.equal(S.order, 'map'); assert.deepEqual(S.days.map((d) => d.file), ['route-a.gpx', 'route-b.gpx', 'route-c.gpx', 'route-d.gpx']); assert.match(p.content[0].text, /Days by the map: each day starts where the one before ended\./);
    assert.deepEqual(S.days.map((d) => d.start.slice(0, 10)), ['2027-03-06', '2027-03-07', '2027-03-09', '2027-03-10']); assert.equal(S.name, 'Garden Route Classic');
    const far = [0, 2].map((k) => ({ name: `x${'ab'[k / 2]}.gpx`, gpx: leg(k * 4) })); // two days nowhere near each other, no numbers: as they came
    assert.equal((await callAs('create_event', { files: far, start: '2027-03-06 07:00' })).structuredContent.order, 'upload');
  });
  await test('numbers and the map disagree: one line says so, the numbers win, the map’s order shown', async () => {
    const files = [{ name: 'day-1.gpx', gpx: leg(0) }, { name: 'day-2.gpx', gpx: leg(2) }, { name: 'day-3.gpx', gpx: leg(1) }];
    const p = await callAs('create_event', { files, start: '2027-03-06 07:00' }), S = p.structuredContent;
    assert.equal(S.order, 'numbers'); assert.deepEqual(S.days.map((d) => d.file), ['day-1.gpx', 'day-2.gpx', 'day-3.gpx']);
    assert.match(S.note, /^The file numbers and the map disagree \(by number, day 2 starts \d+ km from where day 1 ends\); I kept the numbers’ order\. By the map it would be day-1\.gpx, day-3\.gpx, day-2\.gpx\.$/); assert.ok(p.content[0].text.includes(S.note));
  });
  await test('plan_route with several files: the same tour, with its weather', async () => {
    const files = [2, 1].map((k) => ({ name: `Stage ${k}.gpx`, gpx: leg(k - 1) })), d = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const r = await callAs('plan_route', { files, start: `${d} 07:00` }, {}), S = r.structuredContent;
    assert.equal(S.view, 'plan_route'); assert.equal(r._meta['livedot/view'].kind, 'fly'); assert.equal(S.flyover, true); assert.equal(S.order, 'numbers'); assert.deepEqual(S.files, ['Stage 1.gpx', 'Stage 2.gpx']); assert.equal(S.days.length, 2); assert.match(r.content[0].text, /^2 days, in the order of the numbers in the file names\./);
  });
  await test('a file that isn’t a route: named, with why; a ride can’t have five files; the time is asked for', async () => {
    const e = await callAs('create_event', { files: [{ name: '1.gpx', gpx: leg(0) }, { name: 'notes.docx', gpx: 'PK\u0003\u0004 not a gpx' }], start: '2027-03-06 07:00' });
    assert.equal(e.isError, true); assert.match(e.content[0].text, /^notes\.docx isn’t a GPX file\. Fix it or leave it out, then try again\./); assert.match(e.content[0].text, SPONSOR);
    const t = await callAs('create_event', { type: 'ride', files: [{ name: '1.gpx', gpx: leg(0) }, { name: '2.gpx', gpx: leg(1) }], start: '2027-03-06 07:00' }); assert.equal(t.isError, true); assert.match(t.content[0].text, /A ride has one route/);
    const q = await callAs('create_event', { files: [{ name: '1.gpx', gpx: leg(0) }, { name: '2.gpx', gpx: leg(1) }], start: '2027-03-06' }); assert.equal(q.isError, true); assert.match(q.content[0].text, /What time does each day start\?/);
    const big = await callAs('create_event', { files: [{ name: '1.gpx', gpx: leg(0) }, { name: '2.gpx', gpx: leg(1) }], start: '2027-03-06 07:00', notes: 'x'.repeat(10001) }); assert.equal(big.isError, true); assert.match(big.content[0].text, /up to 10,000 characters/);
  });
  await test('who it’s for: a personal ride is private by default (the card says so); a tour or a page’s is shared; private on a page is refused', async () => {
    const p = await callAs('create_event', { name: 'Hill repeats', days: [{ gpx: leg(0), start: '2027-03-06 05:30' }] }), sent = (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).pop().args;
    assert.equal(sent.type, 'ride'); assert.equal(sent.visibility, 'private'); const v = p._meta['livedot/view'];
    assert.equal(v.statusWord, 'Private'); assert.equal(v.updated, 'Private · only you (and anyone with your private link)');
    await callAs('create_event', { name: 'Club tour', type: 'tour', page: 'acme-cc', days: [{ gpx: leg(0), start: '2027-03-06 05:30' }] }); assert.equal((await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).pop().args.visibility, 'shared');
    const x = await callAs('create_event', { name: 'x', visibility: 'private', page: 'acme-cc', days: [{ gpx: leg(0), start: '2027-03-06 05:30' }] }); assert.equal(x.isError, true); assert.match(x.content[0].text, /on no page/);
    await callAs('post_club_ride', { page: 'acme-cc', name: 'Sat', gpx: leg(0), start: '2027-03-06 06:30' }); assert.equal((await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).pop().args.visibility, 'shared');
    const t = (await post({ jsonrpc: '2.0', id: ++n, method: 'tools/list' })).body.result.tools, ce = t.find((y) => y.name === 'create_event'), pc = t.find((y) => y.name === 'post_club_ride');
    for (const d of [ce.description, pc.description]) assert.match(d, /ask one short question first: is this a private ride or run for you, or a group ride or run for <club name>\?/);
    assert.deepEqual(ce.inputSchema.properties.visibility.enum, ['private', 'shared']); assert.match(t.find((y) => y.name === 'list_my_events').description, /club and organiser pages they run/);
  });
  await test('the free paths end with a free-account line for the sport (?ref=mcp), before the sponsor line; never signed in, never on an empty answer', async () => {
    const w = await call('where_is', { handle: 'megan' }), t = w.content[0].text;
    assert.match(t, /\nPlan it in RunFast, free: create your account: https:\/\/runfast\.tech\/app\/\?ref=mcp#\/signup\n\nLive tracking, proudly brought to you free thanks to \[ProLend\]\(https:\/\/[^)]+\)\.$/);
    assert.deepEqual(w._meta['livedot/view'].cta, { label: 'Plan it in RunFast, free: create your account', url: 'https://runfast.tech/app/?ref=mcp#/signup' }); assert.equal(w.structuredContent.signup.url, 'https://runfast.tech/app/?ref=mcp#/signup');
    const r = await call('where_is', { handle: 'livedot.me/thandi' }); assert.match(r.content[0].text, /Plan it in Windline, free: create your account: https:\/\/app\.windline\.tech\/\?ref=mcp#\/signup\n\n/);
    const none = await call('find_person', { name_or_handle: 'Zebedee Quux' }); assert.ok(!/create your account/.test(none.content[0].text), 'not on an empty answer');
    const signed = await callAs('where_is', { handle: 'megan' }); assert.ok(!/create your account/.test(signed.content[0].text) && !signed._meta['livedot/view'].cta, 'not when signed in');
  });
  await test('the sponsor line: the guide, the prompts, every answer (checked on every call above)', async () => {
    const g = (await post({ jsonrpc: '2.0', id: ++n, method: 'resources/read', params: { uri: 'livedot://guide' } })).body.result.contents[0].text; assert.match(g, /\*Live tracking, proudly brought to you free thanks to \w+\.\*\n$/);
    const pg = (await post({ jsonrpc: '2.0', id: ++n, method: 'prompts/get', params: { name: 'fly_a_course', arguments: { event: 'Comrades' } } })).body.result; assert.match(pg.description, SPONSOR);
    const l = (await post({ jsonrpc: '2.0', id: ++n, method: 'tools/list' })).body.result.tools; assert.ok(l.every((x) => !/proudly brought to you/.test(x.description)), 'never in a tool description');
  });
  // ---- a tap on the back (Wes, 17 Oct), through Windline's /api/mcp/tap (stood in for here; the rules are riders.js's and live.js's)
  const lastSeen = async () => (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).pop();
  await test('tap_on_the_back: sent through the apps’ tap, the live map with it, the free-account line, the sponsor line; honest annotations', async () => {
    const r = await call('tap_on_the_back', { handle: 'megan', name: 'Sam' }, { 'openai/subject': 'v1/abc123' }), t = r.content[0].text, sent = await lastSeen();
    assert.match(t, /^Tap sent\. Megan will feel it on their phone\.\n\n/); assert.equal(r.structuredContent.view, 'tap'); assert.equal(r.structuredContent.sent, true); assert.equal(r._meta['livedot/view'].kind, 'person');
    assert.match(t, /Plan it in RunFast, free: create your account/); assert.match(t, SPONSOR);
    assert.equal(sent.args.app, 'runfast'); assert.equal(sent.args.handle, 'megan'); assert.equal(sent.args.name, 'Sam'); assert.match(sent.args.asker, /^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(sent).includes('abc123'), 'the assistant’s user id is hashed before it goes anywhere'); assert.equal(sent.auth, null);
    const tl = TOOLS.find((x) => x.name === 'tap_on_the_back'); assert.equal(tl.annotations.readOnlyHint, false); assert.equal(tl.annotations.destructiveHint, false); assert.match(tl.description, /Only when the user asks/); assert.match(tl.description, /never on your own/);
    assert.deepEqual(tl.securitySchemes, [{ type: 'noauth' }, { type: 'oauth2', scopes: [] }]);
  });
  await test('tap_on_the_back: signed in it carries their name; taps off, again within a minute, not live (private): said plainly; finished in the last day: a congratulation', async () => {
    const si = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'tap_on_the_back', arguments: { handle: 'megan' } } }, { Authorization: 'Bearer good-token' }), sj = (await si.json()).result;
    assert.match(sj.content[0].text, /^Tap sent\./); assert.ok(!/create your account/.test(sj.content[0].text), 'signed in: no free-account line'); assert.equal((await lastSeen()).auth, 'Bearer good-token');
    const off = await call('tap_on_the_back', { handle: 'tapsoff' }); assert.match(off.content[0].text, /^They has taps|turned off/); assert.match(off.content[0].text, /turned off, so I can't send one\./);
    const again = await call('tap_on_the_back', { handle: 'again' }); assert.match(again.content[0].text, /a tap a moment ago: you can give another in a minute\./);
    const priv = await call('tap_on_the_back', { handle: 'private-ride' }); assert.match(priv.content[0].text, /isn't live just now, so a tap can't reach them\./); assert.ok(!/Tap sent/.test(priv.content[0].text));
    const fin = await call('tap_on_the_back', { handle: 'finished-lerato' }); assert.match(fin.content[0].text, /^Tap sent\. Lerato finished, so it lands as a congratulation on their phone\./); assert.equal(fin.structuredContent.finished, true);
    const none = await call('tap_on_the_back', {}); assert.match(none.content[0].text, /Tell me who/);
  });
  // ---- invite members from a CSV (Wes, 17 Oct): read here, sent by Windline's server (invites.js, tested there)
  await test('members from a CSV: messy files read right (delimiters, quotes, headers or none, first and last names, "Name <email>", a BOM)', () => {
    let m = parseMembers('﻿Name,Email\r\n"Smith, Sam",sam@example.com\r\nDan Rider,DAN@example.com\r\n\r\n,\r\nNo Mail,\r\n');
    assert.deepEqual(m.people, [{ name: 'Smith, Sam', email: 'sam@example.com' }, { name: 'Dan Rider', email: 'DAN@example.com' }, { name: 'No Mail', email: '' }]); assert.equal(m.header, true);
    m = parseMembers('Voornaam;Achternaam;E-mailadres\nAnna;de Vries;anna@example.nl\n'); assert.deepEqual(m.people, [{ name: 'Anna de Vries', email: 'anna@example.nl' }]);
    m = parseMembers('first name\tsurname\tmobile\tmail\nEve\tClimber\t+27 82\teve@example.com'); assert.deepEqual(m.people, [{ name: 'Eve Climber', email: 'eve@example.com' }]);
    m = parseMembers('Sam Smith <sam@example.com>\nDan <dan@example.com>'); assert.deepEqual(m.people, [{ name: 'Sam Smith', email: 'sam@example.com' }, { name: 'Dan', email: 'dan@example.com' }]); assert.equal(m.header, false);
    m = parseMembers('fay@example.com,Fay Runner,Johannesburg\nkim@example.com,Kim,Durban'); assert.deepEqual(m.people.map((x) => x.email), ['fay@example.com', 'kim@example.com']); assert.equal(m.people[0].name, 'Fay Runner Johannesburg');
    m = parseMembers('Member|E-mail\n"Ann ""AJ"" Jones"|ann@example.com'); assert.deepEqual(m.people, [{ name: 'Ann "AJ" Jones', email: 'ann@example.com' }]);
    assert.throws(() => parseMembers('x'.repeat(2e6 + 1)), /over 2 MB/);
  });
  await test('invite_members: a preview first, then confirm; signed-in only; the sponsor line; never a free-account line', async () => {
    const csv = 'Name,Email\nSam Smith,sam@example.com\nDan Rider,dan@example.com\n';
    const u = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'invite_members', arguments: { page: 'acme-cc', csv } } }); assert.equal(u.status, 401);
    const pr = (await (await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'invite_members', arguments: { page: 'acme-cc', csv } } }, { Authorization: 'Bearer good-token' })).json()).result;
    assert.equal(pr.structuredContent.view, 'invites'); assert.equal(pr.structuredContent.state, 'preview'); assert.match(pr.content[0].text, SPONSOR); assert.ok(!/create your account/.test(pr.content[0].text));
    let sent = await lastSeen(); assert.equal(sent.tool, 'invite_members'); assert.deepEqual(sent.args.people, [{ name: 'Sam Smith', email: 'sam@example.com' }, { name: 'Dan Rider', email: 'dan@example.com' }]); assert.equal(sent.args.confirm, false); assert.equal(sent.args.page, 'acme-cc');
    const go = (await (await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'invite_members', arguments: { page: 'acme-cc', csv, confirm: true } } }, { Authorization: 'Bearer good-token' })).json()).result;
    assert.equal(go.structuredContent.state, 'sent'); assert.equal((await lastSeen()).args.confirm, true); conforms('invite_members', go);
    const e = (await (await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'invite_members', arguments: { page: 'acme-cc', csv: ' , \n,,\n' } } }, { Authorization: 'Bearer good-token' })).json()).result;
    assert.equal(e.isError, true); assert.match(e.content[0].text, /couldn't find any names or email addresses/);
    const tl = TOOLS.find((x) => x.name === 'invite_members'); assert.equal(tl.annotations.readOnlyHint, false); assert.deepEqual(tl.securitySchemes, [{ type: 'oauth2', scopes: ['events.write'] }]); assert.match(tl.description, /nobody joins until they confirm/);
  });
  // ---- livedot misses (Wes: self-healing; KPMG GO): a note to Windline when a read tool finds nothing or a server fails
  const misses = async () => (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).filter((x) => x.tool === 'miss').map((x) => ({ ...x.args, _proxy: x.proxy, _ip: x.ip }));
  const settle = () => new Promise((r) => setTimeout(r, 150));
  await test('misses: nobody found is noted (the tool, what was asked, the outcome, the servers asked, the build), never who asked', async () => {
    const n0 = (await misses()).length; await call('find_person', { name_or_handle: 'Zebedee Quux', event: 'Some Race' }, { 'openai/subject': 'v1/secret-user', 'openai/userLocation': { country: 'ZA' } }); await settle();
    const m = (await misses()).slice(n0); assert.equal(m.length, 1); const x = m[0];
    assert.equal(x.tool, 'find_person'); assert.equal(x.q, 'Zebedee Quux'); assert.equal(x.event, 'Some Race'); assert.equal(x.outcome, 'none'); assert.equal(x.counts.results, 0); assert.ok(x.counts.asked >= 1);
    assert.ok(x.servers.every((y) => ['windline', 'runfast'].includes(y.app) && Array.isArray(y.statuses))); assert.ok(typeof x.build === 'string' && x.build.length >= 3); assert.ok(x.at > 0);
    assert.equal(x._proxy, 'test-proxy'); assert.equal(x._ip, null); assert.deepEqual(Object.keys(x).filter((k) => !k.startsWith('_')).sort(), ['at', 'build', 'counts', 'event', 'outcome', 'q', 'servers', 'tool']);
    assert.ok(!/secret-user|ZA|openai|Bearer|good-token/.test(JSON.stringify(x)), 'never the asker');
    const n1 = (await misses()).length; await call('where_is', { handle: 'megan' }); await call('event_status', { event: 'Comrades' }); await settle(); assert.equal((await misses()).length, n1, 'an answer is never a miss');
  });
  await test('misses: a server that fails is said plainly (never "couldn’t find anyone") and noted as upstream_error; a follow link’s code is never kept', async () => {
    const n0 = (await misses()).length, r = await call('find_person', { name_or_handle: 'Boom Person' }), t = r.content[0].text; await settle();
    assert.match(t, /^livedot couldn't reach Windline just now, so I can't say whether Boom is racing\. Try again in a moment\./); assert.ok(!/couldn't find anyone/.test(t)); assert.match(t, SPONSOR);
    const m = (await misses()).slice(n0); assert.equal(m.length, 1); assert.equal(m[0].outcome, 'upstream_error:windline:503'); assert.ok(m[0].servers.find((y) => y.app === 'windline').statuses.includes(503));
    await call('where_is', { code: 'zzzzzzzz' }); await call('where_is', { link: 'https://runfast.tech/f/abcd1234' }); await settle();
    const l = (await misses()).slice(n0 + 1); assert.ok(l.length >= 1 && l.every((y) => y.q === '[follow link]'), JSON.stringify(l.map((y) => y.q)));
    assert.equal(missOf('where_is', { person: 'runfast:f:abcd1234' }, { structured: { view: 'none' } }, [{ app: 'runfast', status: 200 }]).q, 'runfast:f:[follow link]');
    assert.equal(missOf('find_person', { name_or_handle: 'x'.repeat(200) }, { structured: { view: 'none' } }, [{ app: 'runfast', status: 200 }]).q.length, 80);
    assert.equal(missOf('event_status', { event: 'Comrades' }, { structured: { view: 'event' } }, [{ app: 'runfast', status: 0, timeout: true }]).outcome, 'timeout:runfast');
    assert.equal(missOf('event_status', { event: 'Coast' }, { structured: { view: 'none', races: [{ name: 'A' }, { name: 'B' }] } }, [{ app: 'windline', status: 200 }]), null, 'a list to choose from is not a miss');
  });
  // ---- full names and photos for Findable people; a tap button on the card (Wes, 17 Oct)
  await test('Findable people: full name and their own photo (from the apps’ hosts only); a handle or link alone: first name and initial, no photo', async () => {
    const b = await call('find_person', { name_or_handle: 'Megan', event: 'Comrades', surname: 'Bot' }), S = b.structuredContent, v = b._meta['livedot/view'];
    assert.equal(S.name, 'Megan Botha'); assert.equal(S.photo, 'https://runfast.tech/img/demo/a01.png'); assert.equal(v.photo, S.photo); assert.match(b.content[0].text, /^Megan Botha /);
    const pk = (await call('find_person', { name_or_handle: 'Megan', event: 'the Comrades preview' }))._meta['livedot/view'].rows;
    const sm = pk.find((x) => x.name === 'Megan Smith'), bo = pk.find((x) => x.name === 'Megan Botha'); if (sm) assert.equal(sm.photo, null, 'a photo from a host that isn’t the app’s: never'); if (bo) assert.equal(bo.photo, 'https://runfast.tech/img/demo/a01.png');
    const t = await call('where_is', { handle: 'livedot.me/thandi' }); assert.equal(t.structuredContent.name, 'Thandi Mokoena'); assert.equal(t.structuredContent.photo, 'https://windline.tech/api/avatar/pfixthandi');
    const h = await call('where_is', { handle: 'megan' }); assert.equal(h.structuredContent.name, 'Megan N.'); assert.equal(h.structuredContent.photo, null);
    const ev = await call('event_status', { event: 'Comrades' }); assert.ok(ev.structuredContent.leaders.every((x) => 'photo' in x));
    const csp = (await post({ jsonrpc: '2.0', id: ++n, method: 'resources/read', params: { uri: 'ui://livedot/live-map.html' } })).body.result.contents[0]._meta;
    for (const d of ['https://windline.tech', 'https://runfast.tech']) { assert.ok(csp.ui.csp.resourceDomains.includes(d)); assert.ok(csp['openai/widgetCSP'].resource_domains.includes(d)); }
  });
  await test('the tap button: shown only when a tap would go through (can_tap); "Congratulate" after the finish; never when taps are off or they stopped', async () => {
    const m = await call('where_is', { handle: 'megan' }); assert.equal(m.structuredContent.can_tap, true); assert.deepEqual(m._meta['livedot/view'].tap, { person: 'h:megan', first: 'Megan', finished: false, label: 'Give Megan a tap on the back' });
    const one = async (sur) => call('find_person', { name_or_handle: 'Megan', event: 'Comrades', surname: sur });
    const off = await one('Nkos'); assert.equal(off.structuredContent.name, 'Megan Nkosi'); assert.equal(off.structuredContent.can_tap, false); assert.equal(off._meta['livedot/view'].tap, null);
    const fin = await one('Kru'); if (fin.structuredContent.status === 'finished') { assert.equal(fin.structuredContent.can_tap, true); assert.equal(fin._meta['livedot/view'].tap.label, 'Congratulate Megan'); }
    const pk = (await call('find_person', { name_or_handle: 'Megan', event: 'the Comrades preview' }))._meta['livedot/view'].rows, stopped = pk.find((x) => x.status === 'stopped');
    if (stopped) { const st = await call('where_is', { person: stopped.id }); assert.equal(st.structuredContent.can_tap, false); assert.equal(st._meta['livedot/view'].tap, null); }
    const tl = TOOLS.find((x) => x.name === 'tap_on_the_back'); assert.equal(tl._meta['openai/widgetAccessible'], true); assert.deepEqual(tl._meta.ui.visibility, ['model', 'app']);
  });
  await test('the widget’s address carries the build (a deploy is a fresh widget in ChatGPT); old addresses still read today’s widget; the card refreshes itself', async () => {
    assert.ok(BUILD && WURI.includes(BUILD)); const t = (await post({ jsonrpc: '2.0', id: ++n, method: 'tools/list' })).body.result.tools;
    t.filter((x) => x._meta && x._meta.ui).forEach((x) => { assert.equal(x._meta.ui.resourceUri, WURI); assert.equal(x._meta['openai/outputTemplate'], WURI); });
    for (const u of [WURI, 'ui://livedot/live-map.html', 'ui://livedot/live-map.0123abcd.html']) { const r = (await post({ jsonrpc: '2.0', id: ++n, method: 'resources/read', params: { uri: u } })).body.result.contents[0]; assert.equal(r.uri, u); assert.match(r.text, /startLive/); }
    assert.equal((await post({ jsonrpc: '2.0', id: ++n, method: 'resources/read', params: { uri: 'ui://livedot/other.html' } })).body.error.code, -32002);
    const m = await call('where_is', { handle: 'megan' }); assert.deepEqual(m._meta['livedot/view'].refresh, { tool: 'where_is', args: { person: 'h:megan', units: m._meta['livedot/view'].units } });
    const e = await call('event_status', { event: 'Comrades' }); assert.equal(e._meta['livedot/view'].refresh.tool, 'event_status');
  });
  await test('the widget starts only once all of it is defined (ChatGPT hands the answer over at once), with a plain card if drawing fails; widgetCSP is arrays of https origins; Apple’s mark and its legal page; the sponsor linked', async () => {
    const r = (await post({ jsonrpc: '2.0', id: ++n, method: 'resources/read', params: { uri: WURI } })).body.result.contents[0], h = r.text;
    assert.match(h, /try \{ boot\(\); \} catch \(e\) \{ fail\(e\); \}\n\}\)\(\);\n<\/script>/); assert.ok(!/onerror=/.test(h), 'no inline handlers (a strict CSP blocks them)'); assert.ok(h.length < 120000);
    const c = r._meta['openai/widgetCSP']; for (const k of ['connect_domains', 'resource_domains']) { assert.ok(Array.isArray(c[k]) && c[k].every((d) => /^https:\/\/[a-z0-9.-]+$/.test(d)), k); }
    assert.ok(c.resource_domains.includes('https://weatherkit.apple.com')); assert.match(h, /weatherkit\.apple\.com\/legal-attribution\.html/);
    const m = await call('where_is', { handle: 'megan' }), v = m._meta['livedot/view']; assert.equal(v.appleLegal, 'https://weatherkit.apple.com/legal-attribution.html'); assert.equal(v.sponsorName, 'ProLend'); assert.match(v.sponsorUrl, /^https:\/\//);
    assert.match(m.content[0].text, /\nWeather: \[Apple Weather\]\(https:\/\/weatherkit\.apple\.com\/legal-attribution\.html\)/); assert.match(m.content[0].text, /free thanks to \[ProLend\]\(https:\/\/[^)]+\)\.$/);
  });
  await test('tour taps: "Where is Alistair’s tour?" shows the tour card with a tap button on its days; the tap goes to the organiser, named as the tour page names them ("Alistair’s Cycle Tours will read it out tonight"); never outside its days', async () => {
    const t = await call('tour_route', { tour: 'Karoo Campfire Tour' }), v = t._meta['livedot/view'];
    assert.equal(t.structuredContent.can_tap, true); assert.deepEqual(v.tap, { tour: 'karoo-campfire-tour', first: null, finished: false, label: 'Give the tour a tap on the back' }); assert.match(t.content[0].text, /give the tour a tap on the back: the organiser reads them out at night/);
    const old = await call('tour_route', { tour: 'Alistair’s Durban Tour 2027' }); assert.equal(old.structuredContent.can_tap, false); assert.equal(old._meta['livedot/view'].tap, null);
    const r = await call('tap_on_the_back', { tour: 'karoo-campfire-tour', name: 'Sam' }), sent = await lastSeen();
    assert.match(r.content[0].text, /^Tap sent\. Alistair’s Cycle Tours will read it out tonight\.\n/); assert.equal(r.structuredContent.tour, 'Karoo Campfire Tour'); assert.equal(sent.args.tour, 'karoo-campfire-tour'); assert.equal(sent.args.app, 'windline'); assert.equal(sent.args.name, 'Sam');
    const no = await call('tap_on_the_back', { tour: 'Alistair’s Durban Tour 2027' }); assert.match(no.content[0].text, /isn’t open for taps on the back/); assert.ok(!/Tap sent/.test(no.content[0].text));
    assert.match(TOOLS.find((x) => x.name === 'tap_on_the_back').description, /pass tour: the tap goes to its organiser/); assert.match(TOOLS.find((x) => x.name === 'tour_route').description, /Where is Alistair\\'s Durban tour\?|Where is Alistair's Durban tour\?/);
  });
  // Wes's demo prompts, as production answers them most of the day: no race live but the demos (the apps list them: config/demo.listed)
  const quiet = { ...env, WINDLINE_API: `http://localhost:${PORT}/quiet/windline`, RUNFAST_API: `http://localhost:${PORT}/quiet/runfast` };
  const callQ = async (name, args) => { const r = await handle(new Request('https://livedot.me/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }) }), quiet);
    const t = await r.text(), j = JSON.parse(t.startsWith('event:') || t.startsWith('data:') ? t.split('\n').find((l) => l.startsWith('data:')).slice(5) : t); assert.ok(j.result, JSON.stringify(j)); conforms(name, j.result); if (SHOW) console.log('\n' + name + ' ' + JSON.stringify(args) + '\n' + j.result.content[0].text); return j.result; };
  await test('Wes’s demo prompts: “How’s the Comrades going?”, “How is the Coast Classic going?”: the demo race, a live race like any other while it’s listed (no “demo” needed)', async () => {
    for (const [ev, nm] of [['Comrades', /Comrades .*\(demo\)/], ['the Comrades', /Comrades .*\(demo\)/], ['Coast Classic', /Coast Classic \(demo\)/]]) {
      const r = await callQ('event_status', { event: ev }); assert.equal(r.structuredContent.view, 'event', ev + ': ' + r.content[0].text.slice(0, 160)); assert.match(r.structuredContent.name, nm); assert.ok(!/No live race on livedot matches/.test(r.content[0].text));
    }
  });
  await test('Wes’s demo prompts: “Fly the Comrades”, “What’s the weather for the Comrades?”: the demo course, no “demo” needed', async () => {
    const f = await callQ('fly_route', { event_or_route: 'Comrades' }); assert.equal(f.structuredContent.view, 'fly_route', f.content[0].text.slice(0, 200)); assert.match(f.content[0].text, /Comrades .*\(demo\)/);
    const w = await callQ('event_weather', { event: 'Comrades' }); assert.equal(w.structuredContent.view, 'event_weather', w.content[0].text.slice(0, 200)); assert.match(w.content[0].text, /Comrades .*\(demo\)/);
    const p = await callQ('find_person', { name_or_handle: 'Megan', event: 'Comrades' }); assert.ok(['picker', 'person'].includes(p.structuredContent.view), p.content[0].text.slice(0, 200));
  });
  await test('tour_route: “Where’s Alistair Cronk’s Durban tour?”, “Durban tour”, “Durban”: one search over the tour’s name and who its page says puts it on (Windline’s /api/event/find)', async () => {
    for (const q of ['Durban tour', 'Durban', 'Alistair Cronk Durban tour', 'Alistair Cronk’s Durban tour']) { const r = await call('tour_route', { tour: q }); assert.equal(r.structuredContent.view, 'tour_route', q + ': ' + r.content[0].text.slice(0, 160)); assert.equal(r.structuredContent.tour, 'Alistair’s Durban Tour 2027'); }
    const k = await call('tour_route', { tour: 'Karoo' }); assert.equal(k.structuredContent.tour, 'Karoo Campfire Tour');
  });
  await test('the demo of a tour’s taps: the showcase tour (two days out) offers the tap while the demo is listed; felt, nothing kept', async () => {
    const t = await call('tour_route', { tour: 'Pacific Coast Tour' }); assert.equal(t.structuredContent.can_tap, true); assert.equal(t._meta['livedot/view'].tap.tour, 'pacific-coast-tour');
    const r = await call('tap_on_the_back', { tour: 'Pacific Coast Tour', name: 'Sam' }); assert.match(r.content[0].text, /^Tap sent\. The organiser will read it out tonight\. \(This is the demo of a tour's taps: nothing is kept\.\)/); assert.equal(r.structuredContent.demo, true);
  });
  await test('nothing to show: every view-none answer still draws a card (the answer’s words, no map, never “Loading…”)', async () => {
    for (const [tool, args, re] of [['tour_route', { tour: 'thomson smillie tour' }, /couldn't find a published Windline tour called "thomson smillie tour"/], ['find_person', { name_or_handle: 'Zzyzx Qwerty' }, /couldn't find anyone called "Zzyzx Qwerty"/], ['event_status', { event: 'Nowhere Classic' }, /No live race on livedot matches "Nowhere Classic"/], ['where_is', { person: 'nonsense' }, /isn't one find_person gave/]]) {
      const r = await call(tool, args), v = r._meta && r._meta['livedot/view']; assert.equal(r.structuredContent.view, 'none'); assert.ok(v, tool + ': no view'); assert.equal(v.kind, 'none'); assert.match(v.message, re); assert.ok(!/Live tracking, proudly/.test(v.message)); assert.match(v.sponsor, /^Live tracking, proudly brought to you free thanks to/);
    }
  });
  await test('tour_route { day }: “fly over day 2 of a tour”: that day from the air, coloured by the weather, with Windline’s Fly it in 3D for the day; a day it hasn’t got: ask which', async () => {
    const r = await call('tour_route', { tour: 'Alistair’s Durban Tour 2027', day: 2 }), v = r._meta['livedot/view'], S = r.structuredContent;
    assert.equal(S.view, 'tour_route'); assert.equal(S.day, 2); assert.equal(v.kind, 'fly'); assert.ok(v.course.length > 10 && v.legs && v.legs.length);
    assert.equal(S.fly_url, 'https://app.windline.tech/fly?e=tour/alistairs-durban-tour-2027&d=2&back=' + encodeURIComponent('https://tour.windline.tech/alistairs-durban-tour-2027/day-2')); assert.deepEqual(v.fly, { url: S.fly_url, label: 'Fly it in 3D' });
    assert.equal(S.day_url, 'https://tour.windline.tech/alistairs-durban-tour-2027/day-2'); assert.match(r.content[0].text, /^Here's day 2 of Alistair’s Durban Tour 2027 from the air: Hillcrest to Durban/); assert.match(r.content[0].text, /\nFly it in 3D: https:\/\/app\.windline\.tech\/fly\?e=tour\//);
    const no = await call('tour_route', { tour: 'Alistair’s Durban Tour 2027', day: 9 }); assert.equal(no.structuredContent.view, 'none'); assert.match(no.content[0].text, /has 2 days\. Ask the user which day \(1 to 2\)/);
    assert.match(TOOLS.find((x) => x.name === 'tour_route').description, /fly over day 3 of a tour/i);
  });
  await test('club_in_race: “How is the UCT team doing in the Comrades?”: the club’s people on its live map in that race, each a person id for where_is; logos from the apps’ hosts only; no one who stopped', async () => {
    const r = await call('club_in_race', { club: 'Durban Striders', event: 'Comrades' }), v = r._meta['livedot/view'], S = r.structuredContent;
    assert.equal(S.view, 'club'); assert.equal(v.kind, 'club'); assert.equal(S.club.name, 'Durban Striders'); assert.equal(v.club.logo, 'https://runfast.tech/img/clubs/striders.png');
    assert.ok(S.count >= 5 && S.count <= 8); assert.equal(S.members.length, S.count); assert.ok(S.members.every((m) => /^runfast:p:pfix/.test(m.id) && m.status !== 'stopped'));
    assert.match(r.content[0].text, /^Durban Striders: \d+ runners in the Comrades \(preview\)/); assert.match(v.subtitle, /^\d+ of our runners in the Comrades \(preview\)$/);
    assert.ok(v.dots.length <= S.count && v.dots.every((d) => isFinite(d.lat) && isFinite(d.lon))); assert.equal(v.dots.length, S.members.filter((m) => m.km != null).length); // a dot only where the public map gives a position
    assert.deepEqual(v.refresh, { tool: 'club_in_race', args: { club: 'runfast:durban-striders', event: 'Comrades', units: 'metric' } }); assert.equal(v.follow.url, 'https://runfast.tech/live/club/durban-striders');
    const again = await call(v.refresh.tool, v.refresh.args); assert.equal(again._meta['livedot/view'].kind, 'club'); assert.equal(again.structuredContent.count, S.count); // the card's 30 s refresh
    const p = await call('where_is', { person: S.members[0].id }); assert.equal(p.structuredContent.view, 'person'); assert.equal(p.structuredContent.name, S.members[0].name); // tapping a face opens their card
    const u = await call('club_in_race', { club: 'the UCT team', event: 'Comrades' }); assert.equal(u.structuredContent.club.name, 'UCT Running Club'); assert.equal(u._meta['livedot/view'].club.logo, null); assert.equal(u._meta['livedot/view'].club.initials, 'URC');
    const a = await call('club_in_race', { club: 'runfast.tech/c/durban-striders' }); assert.equal(a.structuredContent.club.name, 'Durban Striders');
    const w = await call('club_in_race', { club: 'Bay Wheelers', event: 'Coast Classic' }); assert.equal(w.structuredContent.club.app, 'windline'); assert.match(w.content[0].text, /riders in the Coast Classic \(preview\)/);
    const none = await call('club_in_race', { club: 'Nowhere Harriers' }); assert.equal(none.structuredContent.view, 'none'); assert.match(none.content[0].text, /couldn't find a club called "Nowhere Harriers"/);
    const off = await call('club_in_race', { club: 'Bay Wheelers', event: 'Comrades' }); assert.match(off.content[0].text, /No one from Bay Wheelers is on the club's live map in Comrades right now/);
  });
  await test('club_in_race through find_person and event_status (“UCT team”, a club named in a race); the team tap: one tap to each member who takes them, and how many went', async () => {
    const f = await call('find_person', { name_or_handle: 'UCT team', event: 'Comrades' }); assert.equal(f.structuredContent.view, 'club'); assert.equal(f.structuredContent.club.name, 'UCT Running Club');
    const e = await call('event_status', { event: 'Comrades', club: 'Durban Striders' }); assert.equal(e.structuredContent.view, 'club');
    const S = (await call('club_in_race', { club: 'Durban Striders', event: 'Comrades' })).structuredContent, n0 = (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).length;
    const t = await call('tap_on_the_back', { club: 'Durban Striders', event: 'Comrades', name: 'Sam' }), seen = (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).slice(n0).filter((x) => x.tool === 'tap');
    const want = S.members.filter((m) => m.can_tap).length; assert.equal(seen.length, want); assert.ok(seen.every((x) => /^pfix/.test(x.args.pid) && x.args.app === 'runfast' && x.args.name === 'Sam'));
    assert.match(t.content[0].text, new RegExp('^Taps sent to ' + want + ' runners from Durban Striders\\.')); assert.equal(t.structuredContent.taps_sent, want); assert.equal(t._meta['livedot/view'].kind, 'club');
    assert.equal(TOOLS.find((x) => x.name === 'club_in_race').annotations.readOnlyHint, true); assert.match(TOOLS.find((x) => x.name === 'tap_on_the_back').description, /pass club \(and event\)/);
  });
  await test('the demo clubs (Wes’s meetings): “How’s the demo club doing in the Comrades?”, “How are Coast Riders doing in the Coast Classic?”, the names typed plainly: 12 people, photos, live', async () => {
    for (const [args, nm, app] of [[{ club: 'the demo club', event: 'Comrades' }, 'RunFast Demo Club', 'runfast'], [{ club: 'Coast Riders', event: 'Coast Classic' }, 'Coast Riders (demo)', 'windline'], [{ club: 'RunFast Demo Club' }, 'RunFast Demo Club', 'runfast'], [{ club: 'Coast Riders' }, 'Coast Riders (demo)', 'windline']]) {
      const r = await callQ('club_in_race', args), v = r._meta && r._meta['livedot/view']; assert.equal(r.structuredContent.view, 'club', JSON.stringify(args) + ': ' + r.content[0].text.slice(0, 160));
      assert.equal(r.structuredContent.club.name, nm); assert.equal(r.structuredContent.club.app, app); assert.equal(r.structuredContent.count, 12); assert.ok(v.members.every((m) => m.photo && /^https:\/\/(windline|runfast)\.tech\//.test(m.photo)));
      assert.ok(v.dots.length >= 6); assert.ok(v.course.length > 100); assert.equal(v.refresh.tool, 'club_in_race');
      assert.equal(((v.name + ' ' + v.subtitle).match(/\(demo\)/g) || []).length, 1, 'the card says (demo) once: ' + v.name + ' / ' + v.subtitle); assert.ok(!/\(demo\)/.test(v.name));
      assert.ok(v.members.every((m) => m.goal_delta == null || /^(On pace|[+−](\d+:)?\d{1,2}:\d\d)$/.test(m.goal_delta)), 'a goal delta always m:ss: ' + v.members.map((m) => m.goal_delta).join(' '));
    }
    const f = await callQ('find_person', { name_or_handle: 'Coast Riders', event: 'Coast Classic' }); assert.equal(f.structuredContent.view, 'club');
    const d = await callQ('find_person', { name_or_handle: 'demo club', event: 'Comrades' }); assert.equal(d.structuredContent.club.name, 'RunFast Demo Club');
  });
  await test('a route from another app’s tool: an encoded polyline (precision 5 or 6) or points, into plan_route, create_event (and its multi-day preview) and post_club_ride, read by the one route reader as a GPX', async () => {
    const C = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures', 'comrades.json'), 'utf8')).course, pts = []; for (let i = 0; i + 2 < C.length; i += 3) pts.push([C[i], C[i + 1], C[i + 2]]); // synthetic: the Comrades course, never anyone's activity
    const enc = (list, pr) => { const f = 10 ** pr; let la = 0, lo = 0, out = ''; const one = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let o = ''; while (v >= 0x20) { o += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return o + String.fromCharCode(v + 63); };
      for (const p of list) { const a = Math.round(p[0] * f), b = Math.round(p[1] * f); out += one(a - la) + one(b - lo); la = a; lo = b; } return out; };
    const seenNow = async () => (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json());
    const km = (r) => r.structuredContent.km;
    const p5 = await call('plan_route', { polyline: enc(pts, 5), name: 'Saturday route', start: '2026-10-24 06:00', sport: 'run' }); assert.equal(p5.structuredContent.view, 'plan_route', p5.content[0].text.slice(0, 200)); assert.ok(km(p5) > 85 && km(p5) < 95, 'km ' + km(p5));
    const p6 = await call('plan_route', { polyline: enc(pts, 6), start: '2026-10-24 06:00', sport: 'run' }); assert.ok(Math.abs(km(p6) - km(p5)) < 0.5, 'precision 6 read as 6: ' + km(p6));
    const pa = await call('plan_route', { points: pts.map((p) => [p[0], p[1]]), start: '2026-10-24 06:00' }); assert.ok(Math.abs(km(pa) - km(p5)) < 0.5);
    const po = await call('plan_route', { points: pts.map((p) => ({ lat: p[0], lng: p[1], elevation: p[2] })), start: '2026-10-24 06:00' }); assert.ok(Math.abs(km(po) - km(p5)) < 0.5);
    const bad = await call('plan_route', { polyline: 'not a polyline ☃', start: '2026-10-24 06:00' }); assert.match(bad.content[0].text, /couldn’t be read as a route/);
    const few = await call('plan_route', { points: [[-29.6, 30.4]], start: '2026-10-24 06:00' }); assert.match(few.content[0].text, /at least two/);
    const T = { Authorization: 'Bearer good-token' }, half = Math.floor(pts.length / 2);
    const ce = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'create_event', arguments: { type: 'run', race: false, name: 'Saturday long run', polyline: enc(pts, 5), start: '2026-10-24 06:00' } } }, T);
    assert.match((await ce.json()).result.content[0].text, /^Did create_event\./); { const a = (await seenNow()).filter((x) => x.tool === 'create_event').pop().args; assert.equal(a.days.length, 1); assert.equal(a.days[0].pts.length, pts.length); assert.equal(a.tz, 'Africa/Johannesburg'); }
    const pv = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'create_event', arguments: { files: [{ name: 'day-2', points: pts.slice(half) }, { name: 'day-1', polyline: enc(pts.slice(0, half + 1), 5) }], start: '2027-03-06 06:00', name: 'Comrades in two' } } }, T);
    const pt = (await pv.json()).result.content[0].text; assert.match(pt, /Nothing is made yet/); assert.match(pt, /Day 1[\s\S]*Day 2/);
    const cr = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'post_club_ride', arguments: { page: 'acme', name: 'Saturday coffee ride', points: pts.slice(0, 200), start: '2026-10-24 06:00' } } }, T);
    const HOME = /\nThis route came from another app\. If it starts or ends at your home, trim those bits before you publish\.\n/;
    { const ct = (await cr.json()).result.content[0].text; assert.match(ct, /^Did post_club_ride\./); assert.match(ct, HOME); } // a club's: shared
    assert.match(pt, HOME); // a tour from another app's routes: shared, so the line in the preview
    const pr = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'create_event', arguments: { type: 'run', name: 'My long run', polyline: enc(pts, 5), start: '2026-10-24 06:00' } } }, T);
    assert.ok(!HOME.test((await pr.json()).result.content[0].text), 'no line for a private run');
    const gx = await postRaw({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: 'post_club_ride', arguments: { page: 'acme', name: 'Coffee ride', gpx: `<gpx><trk><trkseg>${pts.slice(0, 50).map((p) => `<trkpt lat="${p[0]}" lon="${p[1]}"></trkpt>`).join('')}</trkseg></trk></gpx>`, start: '2026-10-24 06:00' } } }, T);
    assert.ok(!HOME.test((await gx.json()).result.content[0].text), 'no line for the user\'s own GPX');
    const big = await call('plan_route', { points: Array.from({ length: 60000 }, (_, i) => [-29.6 + i * 1e-6, 30.38 + i * 1e-6]), start: '2026-10-24 06:00' }); assert.equal(big.structuredContent.view, 'plan_route'); // thinned to 50,000 before the reader
    for (const t of ['plan_route', 'create_event', 'post_club_ride']) { const d = TOOLS.find((x) => x.name === t).description; assert.match(d, /pass it as polyline or points\. Never ask the user to export a GPX if you already have the route's points\./); assert.ok(!/strava/i.test(d.split('A route can also come')[1])); }
  });
  await test('server instructions: short and functional (a shared GPX → plan_route with gpx_file; a person → find_person, then where_is; cards not restated), no steering; plan_route leads with a shared GPX and keeps openai/fileParams', async () => {
    const i = (await post({ jsonrpc: '2.0', id: ++n, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).body.result.instructions;
    assert.match(i, /^livedot: live race tracking and route weather for runners and cyclists/); assert.match(i, /GPX file, a route link or a route's points[^.]*call plan_route \(pass an attached file as gpx_file;/); assert.match(i, /Never treat a file name as an event name\./);
    assert.match(i, /call find_person, then where_is/); for (const t of ['event_status', 'club_in_race', 'event_weather', 'fly_route', 'find_clubs', 'find_events']) assert.ok(i.includes(t), t); assert.match(i, /don't restate the whole card/);
    assert.ok(!/prefer|instead of|rather than (chatgpt|claude|web)|better than/i.test(i), 'no steering'); assert.ok(i.length < 1200, 'short: ' + i.length);
    assert.equal(serverCard().instructions, i);
    const pr = (await post({ jsonrpc: '2.0', id: ++n, method: 'tools/list' })).body.result.tools.find((x) => x.name === 'plan_route');
    assert.match(pr.description, /^Weather and a flyover for a GPX file or route the user shares/); assert.deepEqual(pr._meta['openai/fileParams'], ['gpx_file', 'gpx_files']); assert.ok(pr.inputSchema.properties.gpx_file);
  });
  await test('a file or route name taken for an event (Wes, 18 Oct: "Beanie_Run.gpx … tomorrow at 06:00" became event_weather "Beanie Run"): the answer points to the route, plainly', async () => {
    const HINT = /^That looks like your own route\. Ask me for the weather on your route and attach the GPX \(or I can use its points\), and you'll get the weather along it with a flyover\./;
    for (const q of ['Beanie_Run.gpx', 'Beanie_Run', 'this route', 'my route', 'the attached route', 'morning_loop.fit']) { const r = await call('event_weather', { event: q }); assert.match(r.content[0].text, HINT, q); assert.equal(r.structuredContent.use, 'plan_route'); }
    const plain = await call('event_weather', { event: 'Beanie Run' }); assert.match(plain.content[0].text, /^I don't have "Beanie Run" on livedot yet\..*If it's your own route, attach the GPX and ask for the weather on your route/);
    assert.ok(!HINT.test((await call('event_weather', { event: 'NYC Marathon' })).content[0].text));
    const ew = TOOLS.find((x) => x.name === 'event_weather').description, pr = TOOLS.find((x) => x.name === 'plan_route'), g = pr.inputSchema.properties.gpx_file;
    assert.match(ew, /Only for named events and races\. Not for the user's own route or GPX file; for those use plan_route\./);
    assert.match(pr.description, /If the user attached a GPX or route file, call plan_route and pass the file as gpx_file; if you can read the file's contents yourself, you may instead pass its text as gpx or its points as points\. Never treat a file name as an event name\./);
    assert.deepEqual(Object.keys(g.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type']); assert.deepEqual(g.required, ['download_url', 'file_id']); // the Apps SDK's file object
    assert.match(pr.inputSchema.properties.points.description, /read from an attached file/); assert.match(pr.inputSchema.properties.gpx.description, /attached a file you can read yourself/);
  });
  await test('attached files (Apps SDK openai/fileParams): every file field is ChatGPT\'s file object (four declared, download_url and file_id required, nothing else); a ChatGPT-shaped GPX reaches plan_route, named from the file', async () => {
    const tools = (await post({ jsonrpc: '2.0', id: ++n, method: 'tools/list' })).body.result.tools; let seen = 0;
    for (const t of tools) for (const k of (t._meta && t._meta['openai/fileParams']) || []) {
      const f = t.inputSchema.properties[k]; assert.ok(f, `${t.name}.${k} isn't in the schema`); const o = f.type === 'array' ? f.items : f; seen++;
      assert.equal(o.type, 'object', `${t.name}.${k}`); assert.deepEqual(Object.keys(o.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type'], `${t.name}.${k}`);
      for (const p of ['download_url', 'file_id', 'file_name', 'mime_type']) assert.equal(o.properties[p].type, 'string', `${t.name}.${k}.${p}`);
      assert.deepEqual([...o.required].sort(), ['download_url', 'file_id'], `${t.name}.${k} required`);
    }
    assert.ok(seen >= 6, 'file fields: ' + seen); for (const n2 of ['plan_route', 'create_event', 'post_club_ride', 'invite_members']) assert.ok(tools.find((x) => x.name === n2)._meta['openai/fileParams'].length, n2);
    const r = await call('plan_route', { gpx_file: { download_url: 'https://files.oaiusercontent.test/abc/Beanie_Run.gpx?sig=x', file_id: 'file-abc', mime_type: 'application/gpx+xml', file_name: 'Beanie_Run.gpx' }, start: '2026-10-19 06:00', sport: 'run' });
    assert.equal(r.structuredContent.view, 'plan_route', r.content[0].text.slice(0, 200)); assert.ok(r._meta['livedot/view'] && r._meta['livedot/view'].course.length > 10, 'a map'); assert.match(r.content[0].text, /Beanie Run/);
    const seenR = (await (await fetch(`http://localhost:${PORT}/mcp-seen`)).json()).filter((x) => x.tool === 'route').pop(); assert.match(seenR.args.url, /Beanie_Run\.gpx/);
    const two = await call('plan_route', { gpx_files: [{ download_url: 'https://files.oaiusercontent.test/d2/day-2.gpx', file_id: 'f2', file_name: 'day-2.gpx' }, { download_url: 'https://files.oaiusercontent.test/d1/day-1.gpx', file_id: 'f1', file_name: 'day-1.gpx' }], start: '2026-10-19 06:00' });
    assert.equal(two.structuredContent.view, 'plan_route', two.content[0].text.slice(0, 200)); assert.deepEqual(two.structuredContent.files, ['day-1', 'day-2']); // ordered by the numbers in their names
  });
  await test('ChatGPT (18 Oct): a status line on every tool, the Apple mark inline, people\'s photos through livedot.me/p/photo (embeddable in the sandbox), never a follow-up message where tools can be called; loading states', async () => {
    const tools = (await post({ jsonrpc: '2.0', id: ++n, method: 'tools/list' })).body.result.tools;
    for (const t of tools) { assert.ok(t._meta['openai/toolInvocation/invoking'] && t._meta['openai/toolInvocation/invoked'], t.name); assert.ok(t._meta['openai/toolInvocation/invoking'].length <= 40, t.name); }
    const by = (n2) => tools.find((x) => x.name === n2)._meta;
    assert.equal(by('find_person')['openai/toolInvocation/invoking'], 'Finding them in the race…'); assert.equal(by('where_is')['openai/toolInvocation/invoked'], 'Live position ready');
    assert.equal(by('plan_route')['openai/toolInvocation/invoking'], 'Reading your route and the weather…'); assert.equal(by('fly_route')['openai/toolInvocation/invoked'], 'Flyover ready');
    const r = (await post({ jsonrpc: '2.0', id: ++n, method: 'resources/read', params: { uri: WURI } })).body.result.contents[0], h = r.text;
    assert.ok(!/src="https:\/\/weatherkit/.test(h), 'the Apple mark is inline'); assert.match(h, /var AW_LT = 'data:image\/png;base64,/); assert.ok(!/src="https:\/\/windline\.tech\/img/.test(h), 'brand marks inline');
    assert.match(h, /livedot\.me\/p\/photo\?u=/); assert.match(h, /crossorigin="anonymous"/); assert.ok(r._meta['openai/widgetCSP'].resource_domains.includes('https://livedot.me'));
    assert.match(h, /if \(host\.canCall\(\)\) \{ b\.disabled = false;/); assert.ok(!/host\.message\('Where is/.test(h), 'no follow-up for a face'); assert.match(h, /class="spin"/); assert.match(h, /Still working…/); assert.match(h, /prefers-reduced-motion:reduce\)\{\.sk:after\{animation:none/);
    const PH = await import('../../functions/p/photo.js'), ask = (u) => PH.onRequest({ request: new Request('https://livedot.me/p/photo?u=' + encodeURIComponent(u)) });
    for (const u of ['https://evil.example/a.png', 'http://runfast.tech/img/demo/a00.png', 'https://runfast.tech.evil.example/a.png', 'not a link']) assert.equal((await ask(u)).status, 400, u);
    const ok = await ask('https://runfast.tech/img/demo/a00.png'); assert.equal(ok.status, 200); assert.equal(ok.headers.get('cross-origin-resource-policy'), 'cross-origin'); assert.equal(ok.headers.get('access-control-allow-origin'), '*'); assert.match(ok.headers.get('content-type'), /^image\//);
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
    const l = (await post({ jsonrpc: '2.0', id: 97, method: 'resources/list' })).body.result.resources; assert.deepEqual(l.map((x) => x.uri), [WURI, 'livedot://guide']);
    const g = (await post({ jsonrpc: '2.0', id: 98, method: 'resources/read', params: { uri: 'livedot://guide' } })).body.result.contents[0]; assert.equal(g.mimeType, 'text/markdown'); assert.match(g.text, /find_person/);
    assert.equal((await post({ jsonrpc: '2.0', id: 99, method: 'resources/read', params: { uri: 'livedot://nope' } })).body.error.code, -32002);
  });
  await test('clean errors: a missing argument, bad arguments, an unknown tool or method, all fast', async () => {
    const t0 = Date.now();
    const m = (await post({ jsonrpc: '2.0', id: 100, method: 'tools/call', params: { name: 'event_weather', arguments: {} } })).body.result;
    assert.equal(m.isError, true); assert.match(m.content[0].text, /^event_weather needs event\.\n\n/); assert.match(m.content[0].text, SPONSOR);
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
