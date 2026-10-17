// Sample data for testing livedot MCP: both apps' public reads, the same shapes as the contracts (Windline live API §5, §14, §16;
// RunFast live-api-v1.2), answered from made-up people on the two demo courses. Never a real person.
//   Comrades (preview)       RunFast, comrades-preview: 400 runners, 24 of them called Megan; livedot.me/megan is Megan Naidoo
//   Coast Classic (preview)  Windline, coast-preview: 150 riders; livedot.me/thandi is Thandi Mokoena
// Forecasts aren't faked: the MCP reads Windline's forecast store as always (weather isn't personal data).
//   node test/fixture-api.mjs            → http://localhost:8790/windline/api/…, /runfast/api/…
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PORT = +process.env.PORT || 8790;
const comrades = JSON.parse(fs.readFileSync(path.join(DIR, 'comrades.json'), 'utf8'));
const coast = JSON.parse(fs.readFileSync(path.join(DIR, 'coast.json'), 'utf8'));

// ---------------------------------------------------------------- a course: running km and the place at any km
function geom(flat) {
  const pts = []; for (let i = 0; i + 2 < flat.length; i += 3) pts.push([flat[i], flat[i + 1], flat[i + 2]]);
  const cum = [0], rad = Math.PI / 180;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dp = (b[0] - a[0]) * rad, dl = (b[1] - a[1]) * rad; const h = Math.sin(dp / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dl / 2) ** 2; cum.push(cum[i - 1] + 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)))); }
  const total = cum[cum.length - 1];
  const at = (km) => { km = Math.max(0, Math.min(total, km)); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= km) lo = m; else hi = m; } const f = cum[hi] === cum[lo] ? 0 : (km - cum[lo]) / (cum[hi] - cum[lo]); return [+(pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f).toFixed(5), +(pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f).toFixed(5)]; };
  return { pts, total, at };
}
const CR = geom(comrades.course), CO = geom(coast.days[0].points);

// ---------------------------------------------------------------- people (seeded, made-up)
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FIRST = ['Sipho', 'Lerato', 'Johan', 'Anika', 'Thabo', 'Naledi', 'Pieter', 'Zanele', 'Ruan', 'Ayesha', 'Kagiso', 'Lindiwe', 'Brendan', 'Precious', 'Andile', 'Chloe', 'Musa', 'Nomsa', 'Dylan', 'Refilwe', 'Liam', 'Tumi', 'Grace', 'Bongani', 'Emma', 'Xolani', 'Kyle', 'Palesa', 'Ethan', 'Mpho'];
const LAST = ['Naidoo', 'Botha', 'van Wyk', 'Dlamini', 'Pillay', 'Nkosi', 'Smith', 'Mokoena', 'Pretorius', 'Khumalo', 'du Plessis', 'Ndlovu', 'Govender', 'Jacobs', 'Mahlangu', 'Fourie', 'Sithole', 'Coetzee', 'Zulu', 'Venter', 'Maharaj', 'Mthembu', 'Steyn', 'Radebe', 'Joubert', 'Moodley', 'Cele', 'Kruger', 'Molefe', 'Nel'];
const MEGANS = ['Naidoo', 'Botha', 'van Wyk', 'Dlamini', 'Pillay', 'Nkosi', 'Smith', 'Pretorius', 'Khumalo', 'du Plessis', 'Ndlovu', 'Govender', 'Jacobs', 'Fourie', 'Coetzee', 'Venter', 'Steyn', 'Joubert', 'Moodley', 'Kruger', 'Nel', 'Barnard', 'Hendricks', 'Adams'];
const HOUR = 36e5;
function field(seed, n, extra) {
  const rnd = mulberry(seed), out = [];
  for (let i = 0; i < n; i++) out.push({ pid: 'pfix' + String(seed).slice(-2) + String(i).padStart(5, '0'), name: FIRST[Math.floor(rnd() * FIRST.length)] + ' ' + LAST[Math.floor(rnd() * LAST.length)], r: rnd(), r2: rnd(), r3: rnd() });
  extra.forEach((x, i) => { out[i * 13 + 5] = { ...out[i * 13 + 5], ...x }; });
  return out;
}
const RUN = field(4101, 400, MEGANS.map((s, i) => ({ name: 'Megan ' + s, pid: 'pfixmeg' + String(i).padStart(4, '0'), // photos as the apps give them (one from a host that isn't theirs: never shown); one with taps off; one finished
  ...(s === 'Botha' ? { photo: 'https://runfast.tech/img/demo/a01.png' } : s === 'Smith' ? { photo: 'https://evil.example/a.png' } : s === 'Nkosi' ? { tapsOff: true } : s === 'Kruger' ? { done: true } : {}) })));
RUN[5] = { ...RUN[5], handle: 'megan', goal: 9 * 3600, r: 0.42, r3: 0.6 };
RUN[0] = { ...RUN[0], name: 'Lerato Fast', pace: 245, r3: 0.5, nearEnd: true }; // out front, 400 m from the finish: the feed hides where (hide the ends), as the real one does // Megan Naidoo: livedot.me/megan, going for a sub-9 (Bill Rowan)
const RIDE = field(5203, 150, [{ name: 'Thandi Mokoena', pid: 'pfixthandi', handle: 'thandi', goal: 6.5 * 3600, photo: '/api/avatar/pfixthandi' }]);

const gun = (now, hoursIn) => Math.floor((now - hoursIn * HOUR) / 6e4) * 6e4;
/** A RunFast runner's Live, now. */
function runner(x, now) {
  const g = gun(now, 6.1), pace = x.pace || 300 + Math.round(x.r * 190), el = (now - g) / 1000, goal = x.goal || (x.r2 < 0.35 ? Math.round((pace - 15) * 90.3 / 600) * 600 : null);
  let status = x.r3 < 0.03 ? 'stopped' : x.r3 < 0.06 ? 'paused' : x.r3 < 0.08 ? 'nosignal' : 'live';
  let km = x.nearEnd ? CR.total - 0.4 : x.done ? CR.total : Math.min(CR.total, el / pace); if (status === 'stopped') km *= 0.7;
  const finished = km >= CR.total - 0.05; if (finished) status = 'finished';
  const ll = CR.at(km), fin = finished ? g + CR.total * pace * 1000 : g + (goal ? goal * 1000 + (el - km * goal / CR.total) * 1000 : CR.total * pace * 1000);
  const v = { pid: x.pid, name: x.name, photo: x.photo || null, status, race: { id: 'comrades-preview', name: 'Comrades (preview)' }, run: null, km: +km.toFixed(3), total: +CR.total.toFixed(1), started: g, goal, tagline: null,
    pace: status === 'live' ? pace : null, plan: { start: new Date(g).toISOString(), pace }, finish: status === 'stopped' ? null : fin, next: null,
    last: status === 'stopped' || km < 1 || CR.total - km < 1 ? null : { lat: ll[0], lon: ll[1], t: now - 20e3 }, line: [], seen: now - 20e3, // hidden near the start and finish
    ghost: goal ? (() => { const gk = Math.min(CR.total, el * CR.total / goal), p = CR.at(gk); return { lat: p[0], lon: p[1], km: +gk.toFixed(3), diff: Math.round(el - km * goal / CR.total) }; })() : null,
    taps: { on: !x.tapsOff, count: Math.round(x.r2 * 60), open: ['live', 'paused', 'delayed', 'nosignal', 'finished'].includes(status) } }; // as live.js: open while running and in the day after the finish
  return v;
}
/** A Windline rider's Live, now. */
function rider(x, now) {
  const g = gun(now, 4.2), speed = 22 + Math.round(x.r * 140) / 10, el = (now - g) / 1000, goal = x.goal || null;
  let status = x.r3 < 0.04 ? 'paused' : 'live'; const km = Math.min(CO.total, (el / 3600) * speed); if (km >= CO.total - 0.05) status = 'finished';
  const ll = CO.at(km), ev = { id: 'coast-preview', name: 'Coast Classic (preview)', type: 'race', day: { id: coast.days[0].id, label: 'Coast Classic' }, tz: 'America/Los_Angeles' };
  return { pid: x.pid, name: x.name, photo: x.photo || null, status, findable: true, event: ev, km: +km.toFixed(3), total: +CO.total.toFixed(3), speed: status === 'live' ? speed : null, started: g,
    plan: { start: new Date(g).toISOString(), speed }, goal, tagline: null,
    ghost: goal ? (() => { const gk = Math.min(CO.total, el * CO.total / goal), p = CO.at(gk); return { lat: p[0], lon: p[1], km: +gk.toFixed(3), diff: Math.round(el - km * goal / CO.total) }; })() : null,
    finish: g + (goal ? goal * 1000 + (el - km * goal / CO.total) * 1000 : CO.total / speed * HOUR), taps: { on: true, open: true, count: Math.round(x.r2 * 80) },
    last: { lat: ll[0], lon: ll[1], t: now - 15e3 }, line: [], seen: now - 15e3 };
}
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const hit = (name, q) => { const t = words(name), w = words(q); return w.length && w.every((x) => t.some((y) => y.startsWith(x))); };

// Windline tours on organisers' pages (preview data): Alistair's Durban Tour 2027 (route files on, notes written: the beta), and
// AllyCat's Winelands Tour (route files off, no notes), both by GET /api/event/tour/<slug> and the pages' GET /api/profile.
const flat = (pts) => pts.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5), p[2] == null ? null : Math.round(p[2])]);
const split = (G, a, b) => { const out = []; let d = 0; for (let i = 0; i < G.pts.length; i++) { if (i) { const x = G.pts[i - 1], y = G.pts[i], r = Math.PI / 180, h = Math.sin((y[0] - x[0]) * r / 2) ** 2 + Math.cos(x[0] * r) * Math.cos(y[0] * r) * Math.sin((y[1] - x[1]) * r / 2) ** 2; d += 12742 * Math.asin(Math.min(1, Math.sqrt(h))); } if (d >= a && d <= b) out.push(G.pts[i]); } return flat(out); };
const TOURS = {
  'alistairs-durban-tour-2027': { page: 'alistair-tours', pageName: 'Alistair\u2019s Cycle Tours', name: 'Alistair\u2019s Durban Tour 2027', routeFiles: true, pace: 24, stops: 60, tz: 'Africa/Johannesburg',
    notes: '## What to pack\n- Two bidons and a hydration pack: the valley roads are hot by 10:00.\n- Arm warmers for the 06:00 starts.\n- A spare tube, a pump and two CO2 cartridges.\n\n## How the tour runs\nWe roll out at 06:00 sharp each day. The support car carries your bag to the next hotel.\n\n## Meeting point\nDay 1: the Pietermaritzburg City Hall steps at 05:40.',
    days: [{ label: 'Day 1', from: 'Pietermaritzburg', to: 'Hillcrest', start: '2027-03-06T04:00:00.000Z', a: 0, b: 50, climb: 980 }, { label: 'Day 2', from: 'Hillcrest', to: 'Durban', start: '2027-03-07T04:00:00.000Z', a: 50, b: 95, climb: 420 }] },
  'allycat-winelands-tour': { page: 'allycat', pageName: 'AllyCat', name: 'AllyCat Winelands Tour', routeFiles: false, pace: 26, stops: 45, tz: 'America/Los_Angeles', notes: null,
    days: [{ label: 'Day 1', from: 'San Francisco', to: 'Pescadero', start: new Date(Date.UTC(2026, 9, 22, 15, 0)).toISOString(), a: 0, b: 80, climb: 900 }, { label: 'Day 2', from: 'Pescadero', to: 'Santa Cruz', start: new Date(Date.UTC(2026, 9, 23, 15, 0)).toISOString(), a: 80, b: 170, climb: 700 }] },
};
function tourEvent(slug) {
  const t = TOURS[slug]; if (!t) return null; const G = slug === 'alistairs-durban-tour-2027' ? CR : CO;
  return { v: 1, type: 'tour', slug, name: t.name, description: '', url: 'https://tour.windline.tech/' + slug, tz: t.tz, pace: t.pace, stops: t.stops, routeFiles: t.routeFiles, branding: null, updatedAt: 0,
    ...(t.notes ? { notes: t.notes, notesUpdatedAt: Date.UTC(2026, 9, 15, 9, 0) } : {}), days: t.days.map((d, i) => { const pts = split(G, d.a, d.b); return { id: 'd' + (i + 1), label: d.label, from: d.from, to: d.to, start: d.start, km: Math.round(d.b - d.a), climb: d.climb, pace: t.pace, stops: t.stops, points: pts }; }) };
}
function route(app, p, q, now) {
  let m;
  if (app === 'windline' && (m = p.match(/^\/event\/tour\/([a-z0-9-]+)$/))) { const ev = tourEvent(m[1]); return ev ? [200, ev] : [404, { error: 'Not found' }]; }
  if (app === 'windline' && p === '/profile' && (q.q || q.slug)) {
    const pages = [...new Set(Object.values(TOURS).map((t) => t.page))].map((slug) => ({ slug, name: Object.values(TOURS).find((t) => t.page === slug).pageName }));
    if (q.slug) { const pg = pages.find((x) => x.slug === q.slug); if (!pg) return [200, { now, profiles: [] }];
      const evs = Object.entries(TOURS).filter(([, t]) => t.page === pg.slug).map(([slug, t]) => ({ id: slug, kind: 'tour', name: t.name, url: 'https://tour.windline.tech/' + slug, tz: t.tz, date: t.days[0].start.slice(0, 10), start: t.days[0].start, km: 100, days: t.days.length }));
      return [200, { now, profiles: [{ v: 1, slug: pg.slug, app: 'windline', sport: 'cycling', type: 'organiser', name: pg.name, url: 'https://windline.tech/o/' + pg.slug, members: 40, events: { live: [], upcoming: evs, past: [] } }] }]; }
    const hitPg = pages.filter((x) => hit(x.name + ' ' + x.slug, q.q)); return [200, { now, profiles: hitPg.map((x) => ({ v: 1, slug: x.slug, app: 'windline', sport: 'cycling', type: 'organiser', name: x.name, url: 'https://windline.tech/o/' + x.slug, live: 0 })) }];
  }
  const people = app === 'windline' ? RIDE : RUN, live = (x) => (app === 'windline' ? rider(x, now) : runner(x, now)), key = app === 'windline' ? 'riders' : 'runners', rid = app === 'windline' ? 'coast-preview' : 'comrades-preview';
  if (p === '/live/find' && app === 'windline' && /boom/i.test(String(q.q || ''))) return [503, { error: 'Briefly unavailable.' }]; // a server that fails (livedot misses)
  if (p === '/live/find') { const t = String(q.q || ''); if (t.replace(/[^A-Za-z]/g, '').length < 3) return [400, { error: 'Type at least 3 letters.' }];
    const L = people.filter((x) => hit(x.name, t)).slice(0, 20).map(live); return [200, { now, [key]: app === 'windline' ? L : L.map((v) => ({ pid: v.pid, name: v.name, photo: null, race: { id: 'comrades-preview', name: v.race.name, kind: 'race' }, live: ['live', 'paused', 'delayed', 'nosignal'].includes(v.status) })) }]; }
  if ((m = p.match(/^\/live\/(rider|runner)$/))) { const ids = String(q.pids || '').split(','); return [200, { now, [key]: people.filter((x) => ids.includes(x.pid)).map(live) }]; }
  if ((m = p.match(/^\/live\/race\/([\w-]+)$/))) { if (m[1] !== rid) return [404, { error: 'There’s no race at this address.' }];
    const t = String(q.q || ''), all = people.map(live).sort((a, b) => b.km - a.km);
    return [200, { now, count: people.length, ...(t ? {} : { taps: { total: 4242, day: null } }), [key]: t.replace(/[^A-Za-z]/g, '').length >= 3 ? all.filter((v) => hit(v.name, t)).slice(0, 20) : all.slice(0, 50) }]; }
  if ((m = p.match(/^\/race\/([\w-]+)$/))) { if (m[1] !== rid) return [404, { error: 'There’s no race at this address.' }];
    return [200, app === 'windline' ? { ...coast, id: rid, name: 'Coast Classic (preview)', start: new Date(gun(now, 4.2)).toISOString() } : { ...comrades, id: rid, name: 'Comrades (preview)', start: new Date(gun(now, 6.1)).toISOString() }]; }
  if ((m = p.match(/^\/live\/h\/([\w-]+)$/))) { const x = people.find((y) => y.handle === m[1]); return x ? [200, { now, handle: x.handle, [key]: [live(x)] }] : [404, { error: 'They may have changed or released it.' }]; }
  if ((m = p.match(/^\/live\/f\/(\w+)$/))) { const x = m[1] === 'demo' ? people[5] : null; return x ? [200, { now, [key]: [live(x)] }] : [404, { error: 'That link has been reset.' }]; }
  if (app === 'windline' && (m = p.match(/^\/handle\/([\w-]+)$/))) {
    const r = RUN.find((y) => y.handle === m[1]), w = RIDE.find((y) => y.handle === m[1]), x = r || w, a = r ? 'runfast' : 'windline';
    if (!x) return [200, { now, handle: null, state: 'unknown' }];
    const v = r ? runner(r, now) : rider(w, now), nm = x.name.split(' ')[0] + ' ' + x.name.split(' ').pop()[0] + '.';
    return [200, { now, v: 1, handle: x.handle, url: 'https://livedot.me/' + x.handle, index: true, person: { name: nm, photo: null }, apps: [a], state: 'live',
      live: [{ app: a, sport: r ? 'running' : 'cycling', race: v.race ? v.race.name : v.event.name, day: null, status: v.status, km: v.km, total: v.total, tz: r ? 'Africa/Johannesburg' : 'America/Los_Angeles', seen: v.seen, url: 'https://livedot.me/' + x.handle }], upcoming: [], follow: { [a]: true } }];
  }
  if (p === '/profile') {
    if (q.live) { const L = people.map(live), on = L.filter((v) => ['live', 'paused', 'nosignal'].includes(v.status)), lead = on.sort((a, b) => b.km - a.km)[0];
      const ev = { id: rid, app, sport: app === 'windline' ? 'cycling' : 'running', kind: 'race', name: app === 'windline' ? 'Coast Classic (preview)' : 'Comrades (preview)', organiser: null, country: app === 'windline' ? 'US' : 'ZA', centre: [0, 0], course: [], people: people.length, finished: L.filter((v) => v.status === 'finished').length, leader: lead ? { km: lead.km, total: lead.total } : null, started: L[0].started, url: (app === 'windline' ? 'https://windline.tech' : 'https://runfast.tech') + '/live/race/' + rid, page: null, feed: '/live/race/' + rid, track: '/race/' + rid, tz: app === 'windline' ? 'America/Los_Angeles' : 'Africa/Johannesburg' };
      return [200, { now, total: 1, people: people.length, countries: 1, events: [ev], next: null }]; }
    if (q.upcoming) return [200, { now, events: [] }];
    if (q.q) return [200, { now, profiles: [] }];
    return [200, { now, profiles: [] }];
  }
  return [404, { error: 'Not found' }];
}

// livedot MCP's sign-in tools, stood in for (the real ones: Windline's mcpApi, tested on the emulators there): the route reader reads
// trkpt points; a tool answers only to the token "good-token" and says back what it got.
function mcpStub(req, res, p, raw) {
  const j = (code, b) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { b = {}; }
  if (p === '/miss') { MCP_SEEN.push({ tool: 'miss', args: b, proxy: req.headers['x-livedot-proxy'] || null, ip: req.headers['x-livedot-client-ip'] || null }); return j(200, { ok: true }); }
  if (p === '/tap') { // Windline's /api/mcp/tap, stood in for: the handle or pid decides the answer (the real rules are riders.js's and live.js's)
    MCP_SEEN.push({ tool: 'tap', args: b, auth: req.headers.authorization || null });
    const who = b.handle || b.pid || b.code || '';
    if (/^(pprivate|private)/.test(who)) return j(404, { ok: false, error: 'They aren’t live just now.' });
    if (/tapsoff/.test(who)) return j(403, { ok: false, error: 'They’ve turned taps on the back off.' });
    if (/again/.test(who)) return j(429, { ok: false, error: 'You can give them another in a minute.' });
    if (/finished/.test(who)) return j(200, { ok: true, named: !!b.name, count: 12, finished: true, first: 'Lerato' });
    return j(200, { ok: true, named: !!(b.name || req.headers.authorization), count: 7, finished: false, first: 'Megan', signedIn: !!req.headers.authorization });
  }
  if (p === '/route') {
    if (b.url && /strava/.test(b.url)) return j(400, { ok: false, error: 'Strava only shares a route with the account that made it.' });
    const pts = [...String(b.gpx || '').matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => [+m[1], +m[2], null]);
    if (!/<gpx[\s>]/i.test(String(b.gpx || '')) && !b.url) return j(400, { ok: false, error: 'That file isn’t a GPX file.' });
    if (pts.length < 2) return j(400, { ok: false, error: 'That file has no route in it.' });
    let km = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], c = pts[i], r = Math.PI / 180, h = Math.sin((c[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(c[0] * r) * Math.sin((c[1] - a[1]) * r / 2) ** 2; km += 12742 * Math.asin(Math.sqrt(h)); }
    const nm = /<name>(.+?) → (.+?)<\/name>/.exec(String(b.gpx || '')), cl = /<desc>climb=(\d+)<\/desc>/.exec(String(b.gpx || ''));
    const gn = /<name>([^<]+)<\/name>/.exec(String(b.gpx || ''));
    return j(200, { ok: true, routes: [{ name: gn ? gn[1] : '', from: nm ? nm[1] : '', to: nm ? nm[2] : '', km: Math.round(km * 10) / 10, climb: cl ? +cl[1] : 0, pts }] });
  }
  const m = p.match(/^\/tool\/(\w+)$/);
  if (m) { if (req.headers.authorization !== 'Bearer good-token') return j(401, { ok: false, error: 'Sign in again.' }); MCP_SEEN.push({ tool: m[1], args: b.args }); if (m[1] === 'invite_members') return j(200, { ok: true, app: 'windline', text: b.args.confirm ? `Sent ${b.args.people.length} people an invite.` : `Ready to invite ${b.args.people.length} people.`, data: { state: b.args.confirm ? 'sent' : 'preview', to_send: b.args.people.length, skipped: { invalid: 0, duplicate: 0, already: 0, unsubscribed: 0, over_limit: 0 } } });
    return j(200, { ok: true, app: 'windline', text: `Did ${m[1]}.`, data: { id: 'ev1', ...(m[1] === 'create_event' || m[1] === 'post_club_ride' ? { type: m[1] === 'create_event' ? 'tour' : 'ride', status: 'draft', dashboard: 'https://app.windline.tech/#/e/ev1' } : {}) } }); }
  return j(404, { ok: false, error: 'Not found' });
}
export const MCP_SEEN = [];
http.createServer((req, res) => {
  const um = new URL(req.url, 'http://x');
  if (um.pathname.startsWith('/windline/api/mcp/')) { let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => mcpStub(req, res, um.pathname.replace('/windline/api/mcp', ''), raw)); return; }
  if (um.pathname === '/mcp-seen') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(MCP_SEEN)); }
  const u = new URL(req.url, 'http://x'), m = u.pathname.match(/^\/(windline|runfast)\/api(\/.*?)\/?$/), now = Date.now();
  const [code, body] = m ? route(m[1], m[2], Object.fromEntries(u.searchParams), now) : [404, { error: 'Not found' }];
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`fixture API on http://localhost:${PORT} (sample data)`));
