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
// the club and coach line (coach-line contract, 18 Oct): `team` on every rider view, as the apps' demo sets it (config/demo.listed);
// a few with their club only, most with neither, and a private run with none (the servers send null on private, always)
const T = {
  prolend: { slug: 'prolend-cycling-club', name: 'ProLend Cycling Club', logo: 'https://windline.tech/img/sponsors/prolend.png', url: 'https://livedot.me/prolend-cycling-club#cycling' },
  coast: { slug: 'demo', name: 'Coast Riders', url: 'https://livedot.me/demo#cycling', logo: null },
  striders: { slug: 'durban-striders', name: 'Durban Striders', logo: null, url: 'https://livedot.me/durban-striders#running' },
  fourways: { slug: 'fourways-striders', name: 'Fourways Striders', logo: null, url: 'https://livedot.me/fourways-striders#running' },
  bay: { slug: 'bay-wheelers', name: 'Bay Wheelers', logo: null, url: 'https://livedot.me/bay-wheelers#cycling' },
};
RUN[5].team = { club: T.prolend, coach: { slug: 'coach-nadia-pillay', name: 'Coach Nadia Pillay', url: 'https://livedot.me/coach-nadia-pillay', demo: true } }; // Megan Naidoo
RIDE[5].team = { club: T.coast, coach: { slug: 'coach-sipho-dlamini', name: 'Coach Sipho Dlamini', url: 'https://livedot.me/coach-sipho-dlamini', demo: true } }; // Thandi Mokoena
[7, 20, 46, 59, 72, 85, 98].forEach((i) => { RUN[i].team = { club: T.striders, coach: null }; }); RUN[33].team = { club: T.fourways, coach: null }; // Durban Striders' map: one shows another club
RUN[18].team = { club: T.fourways, coach: null }; RUN[44].team = { club: T.striders, coach: null }; // two more Megans, club only
[9, 22, 35].forEach((i) => { RIDE[i].team = { club: T.bay, coach: null }; });
// coaches (coach-line addition, 18 Oct): Coach Nadia Pillay (RunFast demo) coaches 8 runners in the Comrades demo, Megan Naidoo among
// them, spread through the field; Coach Sipho Dlamini (Windline demo) 6 riders in the Coast Classic demo, Thandi among them. Plus
// look-alikes for the pickers: a second Coach Nadia on RunFast (live in two races), a Coach Nadia Pillay on Windline (live in one),
// a coach with no one racing (one public event coming up), and a second club of Striders on each app.
const NADIA = { slug: 'coach-nadia-pillay', name: 'Coach Nadia Pillay', url: 'https://livedot.me/coach-nadia-pillay', demo: true };
const SIPHO = { slug: 'coach-sipho-dlamini', name: 'Coach Sipho Dlamini', url: 'https://livedot.me/coach-sipho-dlamini', demo: true };
const RFDEMO = { slug: 'demo', name: 'RunFast Demo Club', logo: null, url: 'https://livedot.me/demo#running' };
const CDEMO = { id: 'comrades-demo', name: 'Comrades Marathon (demo)' }, WDEMO = { id: 'coast-demo', name: 'Coast Classic (demo)' };
const pic = (n) => `https://runfast.tech/img/demo/a0${n}.png`;
// RunFast's Comrades demo as its server sends it (coach-line, 8b98fd3): Coach Nadia Pillay's 8, by pid; ahead of and behind their goals,
// one at the start line (km 0: no position), one finished (late in the demo's 6-hour loop)
const NADIA_RUN = [['pdemo00megan', 'Megan Naidoo', 330, 28531, T.prolend], ['pdemo0000002', 'Pieter Naidoo', 290, 32400, RFDEMO], ['pdemo0000005', 'Sipho Fourie', 0, 30600, RFDEMO],
  ['pdemo0000008', 'Thabo Khumalo', 300, 31500, RFDEMO], ['pdemo0000009', 'Naledi Fourie', 350, 28800, RFDEMO], ['pdemo0000011', 'Anika Khumalo', 310, 34200, RFDEMO],
  ['pdemo0000014', 'Emma Smith', 360, 30000, null], ['pdemo0000017', 'Palesa Smith', 4e6, 39600, null]]
  .map(([pid, name, pace, goal, club], i) => ({ pid, name, pace: pace || 280, done: !pace, goal, photo: pic(i + 1), r: 0.5, r2: 0.6, r3: 0.5, raceAs: CDEMO, team: { club, coach: NADIA } }));
const SIPHO_RIDE = [{ ...RIDE[5], pid: 'pdemo0thandi', name: 'Thandi Mokoena (demo)', raceAs: WDEMO }, ...[2, 5, 9, 17, 40].map((n, i) => ({ ...RIDE[20 + i * 7], pid: 'pdemo00000' + String(n).padStart(2, '0'), raceAs: WDEMO, team: { club: n < 10 ? T.coast : null, coach: SIPHO } }))];
const NADIA_B = { slug: 'coach-nadia-botha', name: 'Coach Nadia Botha', url: 'https://livedot.me/coach-nadia-botha' }, NADIA_W = { slug: 'nadia-pillay-cycling', name: 'Coach Nadia Pillay', url: 'https://livedot.me/nadia-pillay-cycling' };
const HALF = { id: 'run-harbour-half', name: 'Harbour Half' };
const BOTHA_RUN = [[110, null], [123, null], [136, HALF], [149, HALF]].map(([i, r]) => ({ ...RUN[i], r3: 0.5, ...(r ? { raceAs: r } : {}), team: { club: null, coach: NADIA_B } }));
const NADIA_W_RIDE = [60, 73].map((i) => ({ ...RIDE[i], team: { club: null, coach: NADIA_W } }));
const COACHES = { // the page search's coach pages (coach: true), each with its live feed (GET /api/live/coach/<slug>)
  runfast: { 'coach-nadia-pillay': { c: NADIA, line: 'Comrades and ultra coaching, Durban.', logo: pic(2), area: { name: 'Durban', lat: -29.86, lon: 31.02, country: 'ZA' }, demo: true, people: NADIA_RUN },
    'coach-nadia-botha': { c: NADIA_B, line: 'Road running, Johannesburg.', logo: null, area: { name: 'Johannesburg', lat: -26.2, lon: 28.05, country: 'ZA' }, people: BOTHA_RUN },
    'coach-thabo-quiet': { c: { slug: 'coach-thabo-quiet', name: 'Coach Thabo Quiet', url: 'https://livedot.me/coach-thabo-quiet' }, line: 'Trail running, Cape Town.', logo: null, area: { name: 'Cape Town', lat: -33.92, lon: 18.42, country: 'ZA' }, people: [],
      upcoming: [{ id: 'run-table-mountain', kind: 'race', name: 'Table Mountain Trail', url: 'https://runfast.tech/r/table-mountain', tz: 'Africa/Johannesburg', date: '2026-11-08', start: '2026-11-08T04:00:00.000Z', km: 21 }] } },
  windline: { 'coach-sipho-dlamini': { c: SIPHO, line: 'Road cycling, San Francisco Bay.', logo: null, area: { name: 'San Francisco', lat: 37.77, lon: -122.42, country: 'US' }, demo: true, people: SIPHO_RIDE },
    'nadia-pillay-cycling': { c: NADIA_W, line: 'Cycling coach, Cape Town.', logo: null, area: { name: 'Cape Town', lat: -33.92, lon: 18.42, country: 'ZA' }, people: NADIA_W_RIDE } },
};
const EXTRA = { runfast: [...NADIA_RUN, ...BOTHA_RUN], windline: [...SIPHO_RIDE, ...NADIA_W_RIDE] }; // where_is finds them by pid
const PRIV = { ...RUN[60], pid: 'pfixprivate', name: 'Nomsa Private', private: true, team: null }; // on a private run (a follow link only): team null

const gun = (now, hoursIn) => Math.floor((now - hoursIn * HOUR) / 6e4) * 6e4;
/** A RunFast runner's Live, now. */
function runner(x, now) {
  const g = gun(now, 6.1), pace = x.pace || 300 + Math.round(x.r * 190), el = (now - g) / 1000, goal = x.goal || (x.r2 < 0.35 ? Math.round((pace - 15) * 90.3 / 600) * 600 : null);
  let status = x.r3 < 0.03 ? 'stopped' : x.r3 < 0.06 ? 'paused' : x.r3 < 0.08 ? 'nosignal' : 'live';
  let km = x.nearEnd ? CR.total - 0.4 : x.done ? CR.total : Math.min(CR.total, el / pace); if (status === 'stopped') km *= 0.7;
  const finished = km >= CR.total - 0.05; if (finished) status = 'finished';
  const ll = CR.at(km), fin = finished ? g + CR.total * pace * 1000 : g + (goal ? goal * 1000 + (el - km * goal / CR.total) * 1000 : CR.total * pace * 1000);
  const v = { pid: x.pid, name: x.name, photo: x.photo || null, status, race: x.private ? { id: 'run-priv01', name: 'Sunday long run', private: true } : x.raceAs || { id: 'comrades-preview', name: 'Comrades (preview)' }, run: null, team: x.team || null, km: +km.toFixed(3), total: +CR.total.toFixed(1), started: g, goal, tagline: null,
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
  const ll = CO.at(km), ev = { id: 'coast-preview', name: 'Coast Classic (preview)', ...(x.raceAs || {}), type: 'race', day: { id: coast.days[0].id, label: 'Coast Classic' }, tz: 'America/Los_Angeles' };
  return { pid: x.pid, name: x.name, photo: x.photo || null, status, findable: true, event: ev, team: x.team || null, km: +km.toFixed(3), total: +CO.total.toFixed(3), speed: status === 'live' ? speed : null, started: g,
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
  // on its days now (a tour's tap on the back reaches its organiser: livedot's tap_on_the_back { tour })
  'karoo-campfire-tour': { page: 'alistair-tours', pageName: 'Alistair\u2019s Cycle Tours', name: 'Karoo Campfire Tour', routeFiles: false, pace: 24, stops: 60, tz: 'Africa/Johannesburg', notes: null, tapsOn: true,
    days: [{ label: 'Day 1', from: 'Hillcrest', to: 'Durban', start: new Date(Date.now() - 2 * 36e5).toISOString(), a: 0, b: 45, climb: 300 }, { label: 'Day 2', from: 'Durban', to: 'Ballito', start: new Date(Date.now() + 22 * 36e5).toISOString(), a: 45, b: 90, climb: 200 }] },
  // the showcase tour, always two days out: the demo of a tour's taps while the demo is listed (the event says tapsDemo)
  'pacific-coast-tour': { name: 'Pacific Coast Tour', routeFiles: false, pace: 25, stops: 60, tz: 'America/Los_Angeles', notes: null, tapsDemo: true,
    days: [{ label: 'Day 1', from: 'San Francisco', to: 'Santa Cruz', start: new Date(Date.now() + 48 * 36e5).toISOString(), a: 0, b: 80, climb: 900 }] },
  'allycat-winelands-tour': { page: 'allycat', pageName: 'AllyCat', name: 'AllyCat Winelands Tour', routeFiles: false, pace: 26, stops: 45, tz: 'America/Los_Angeles', notes: null,
    days: [{ label: 'Day 1', from: 'San Francisco', to: 'Pescadero', start: new Date(Date.UTC(2026, 9, 22, 15, 0)).toISOString(), a: 0, b: 80, climb: 900 }, { label: 'Day 2', from: 'Pescadero', to: 'Santa Cruz', start: new Date(Date.UTC(2026, 9, 23, 15, 0)).toISOString(), a: 80, b: 170, climb: 700 }] },
};
function tourEvent(slug) {
  const t = TOURS[slug]; if (!t) return null; const G = slug === 'alistairs-durban-tour-2027' ? CR : CO;
  return { v: 1, type: 'tour', slug, name: t.name, description: '', url: 'https://tour.windline.tech/' + slug, tz: t.tz, pace: t.pace, stops: t.stops, routeFiles: t.routeFiles, branding: null, updatedAt: 0,
    tapsOn: t.tapsOn !== false, ...(t.tapsDemo ? { tapsDemo: true } : {}), ...(t.notes ? { notes: t.notes, notesUpdatedAt: Date.UTC(2026, 9, 15, 9, 0) } : {}), days: t.days.map((d, i) => { const pts = split(G, d.a, d.b); return { id: 'd' + (i + 1), label: d.label, from: d.from, to: d.to, start: d.start, km: Math.round(d.b - d.a), climb: d.climb, pace: t.pace, stops: t.stops, points: pts }; }) };
}
// find_clubs, find_events: clubs and events near Fourways, Johannesburg, in the contract's shape (a club's url and join: its livedot.me
// address, #cycling / #running and #join-cycling / #join-running, Wes 17 Oct) (Windline handoffs/2026-10-17-clubs-near-
// contract.md); anywhere else, none. Starts are relative to now, so the weather column is inside its 10 days for the first rows.
const FW = { lat: -26.0106, lon: 28.0104 };
function near(app, what, q, now) {
  const lat = +q.lat, lon = +q.lon, km = +q.km || 25, d = Math.hypot((lat - FW.lat) * 111, (lon - FW.lon) * 100);
  const day = (n, h) => { const t = new Date(now + n * 864e5); t.setUTCHours(h - 2, 0, 0, 0); return t.toISOString(); };
  const area = (name, la, lo) => ({ name, lat: la, lon: lo, country: 'ZA' });
  const CLUBS = {
    windline: [
      { id: 'club:fourways-wheelers', app: 'windline', name: 'Fourways Wheelers', url: 'https://livedot.me/fourways-wheelers#cycling', join: 'https://livedot.me/fourways-wheelers#join-cycling', photo: 'https://windline.tech/img/fw.png', kind: 'club',
        area: area('Fourways', -26.011, 28.01), sports: ['road'], sessions: [{ day: 'tue', time: '17:30', place: 'Fourways Mall', sport: null }, { day: 'sat', time: '06:00', place: 'Fourways', sport: null }], sessionsLine: 'Tue 17:30 from Fourways Mall · Sat 06:00 from Fourways',
        beginnersWelcome: true, paceGroups: '25–30 km/h', whoFor: 'Anyone with a road bike', next: { start: day(2, 6), place: 'Fourways', kind: 'ride', name: 'Saturday Bunch', url: 'https://ride.windline.tech/fw-saturday' }, km: 0,
        openToAll: true, areaSource: 'set', links: { url: 'https://fourways-wheelers.biotree.bio/', biotree: true } },
      { id: 'organiser:jozi-tours', app: 'windline', name: 'Jozi Tours', url: 'https://livedot.me/jozi-tours#cycling', join: 'https://livedot.me/jozi-tours#join-cycling', photo: null, kind: 'organiser',
        area: area('Johannesburg', -26.204, 28.047), sports: ['tours', 'road'], sessions: [], sessionsLine: '', beginnersWelcome: false, paceGroups: null, whoFor: null, next: { start: day(28, 6), place: 'Muldersdrift', kind: 'tour', name: 'Cradle 3-Day', url: 'https://tour.windline.tech/cradle-3-day' }, km: 21.8,
        openToAll: null, areaSource: 'auto', links: null },
    ],
    runfast: [
      { id: 'club:fourways-striders', app: 'runfast', name: 'Fourways Striders', url: 'https://livedot.me/fourways-striders#running', join: 'https://livedot.me/fourways-striders#join-running', photo: 'https://runfast.tech/img/fs.png', kind: 'club',
        area: area('Fourways', -26.011, 28.01), sports: ['road-run'], sessions: [{ day: 'tue', time: '17:30', place: 'Fourways Mall', sport: null }, { day: 'sat', time: '06:00', place: 'Montecasino', sport: null }], sessionsLine: 'Tue 17:30 from Fourways Mall · Sat 06:00 from Montecasino',
        beginnersWelcome: true, paceGroups: '5:30–7:00 /km', whoFor: 'Anyone who can run 5 km', next: { start: day(1, 17), place: 'Fourways Mall', kind: 'session' }, km: 0,
        openToAll: false, areaSource: 'set', links: { url: 'https://biotree.bio.example.com/striders', biotree: true } }, // a look-alike host: Club links, never Biotree's mark
      { id: 'club:jozi-trail', app: 'runfast', name: 'Jozi Trail Runners', url: 'https://livedot.me/jozi-trail#running', join: 'https://livedot.me/jozi-trail#join-running', photo: null, kind: 'club',
        area: area('Northcliff', -26.143, 27.968), sports: ['trail-run'], sessions: [{ day: 'sun', time: '06:30', place: 'Northcliff Hill', sport: null }], sessionsLine: 'Sun 06:30 from Northcliff Hill', beginnersWelcome: false, paceGroups: null, whoFor: null,
        next: { start: day(3, 6), place: 'Northcliff Hill', kind: 'session' }, km: 15.4, openToAll: true, areaSource: 'auto', links: { url: 'http://jozi-trail.example/', biotree: false } }, // not https: no link
    ],
  };
  const EVENTS = {
    windline: [
      { id: 'ride:fw-saturday', app: 'windline', name: 'Saturday Bunch', url: 'https://ride.windline.tech/fw-saturday', join: 'https://windline.tech/c/fourways-wheelers#join', photo: 'https://windline.tech/img/fw.png', kind: 'ride', area: area('Fourways', -26.012, 28.009), sports: ['road'],
        club: { id: 'club:fourways-wheelers', name: 'Fourways Wheelers', url: 'https://windline.tech/c/fourways-wheelers' }, sessions: [], beginnersWelcome: true, paceGroups: '25–30 km/h', start: day(2, 6), km: 0.1 },
      { id: 'tour:cradle-3-day', app: 'windline', name: 'Cradle 3-Day', url: 'https://tour.windline.tech/cradle-3-day', join: 'https://windline.tech/o/jozi-tours#join', photo: null, kind: 'tour', area: area('Muldersdrift', -26.03, 27.85), sports: ['road', 'tours'],
        club: { id: 'organiser:jozi-tours', name: 'Jozi Tours', url: 'https://windline.tech/o/jozi-tours' }, sessions: [], beginnersWelcome: false, paceGroups: null, start: day(28, 6), km: 16.1 },
    ],
    runfast: [
      { id: 'run:rSat', app: 'runfast', name: 'Saturday Long Run', url: 'https://runfast.tech/r/rSat', join: 'https://runfast.tech/r/rSat', photo: 'https://runfast.tech/img/fs.png', kind: 'run', area: area('Montecasino', -26.012, 28.009), sports: ['road-run'],
        club: { id: 'club:fourways-striders', name: 'Fourways Striders', url: 'https://runfast.tech/c/fourways-striders' }, sessions: [], beginnersWelcome: true, paceGroups: '5:30–7:00 /km', start: day(2, 6), km: 0.1 },
    ],
  };
  // find_coaches (coaches directive, 18 Oct): coaches and training groups, a club page with coach: true (GET /api/coaches/near).
  // the apps' demo coaches (coach-line's Coach Sipho Dlamini on Windline, Coach Nadia Pillay on RunFast, in Durban North) and two
  // made-up coaches; never a real person.
  const weekly = (dow, h, mi) => { for (let n = 1; n <= 7; n++) { const t = new Date(now + n * 864e5); if (new Date(t.getTime() + 2 * 36e5).getUTCDay() === dow) { t.setUTCHours(h - 2, mi, 0, 0); return t.toISOString(); } } return null; }; // the next such weekday, Johannesburg time
  const COACHES = {
    windline: [
      { id: 'club:coach-sipho-dlamini', app: 'windline', name: 'Coach Sipho Dlamini', url: 'https://livedot.me/coach-sipho-dlamini#cycling', join: null, photo: null, kind: 'club', coach: true,
        area: area('Fourways', -26.017, 28.009), sports: ['road', 'gravel'], sessions: [{ day: 'wed', time: '17:30', place: 'Fourways Mall', sport: 'road' }, { day: 'sat', time: '06:00', place: 'Fourways Mall', sport: 'road' }], sessionsLine: 'Wed 17:30 from Fourways Mall · Sat 06:00 from Fourways Mall',
        beginnersWelcome: true, paceGroups: '25 and 30 km/h groups', whoFor: 'Road and gravel riders, new or racing (demo coach)', next: { start: weekly(3, 17, 30), place: 'Fourways Mall', kind: 'session' }, km: 0.7, openToAll: true, areaSource: 'set', links: null,
        specialties: ['road', 'gravel', 'beginners', 'racing'], format: ['one-to-one', 'group', 'online'], qualifications: 'Demo profile: no real qualification' },
      { id: 'club:ride-strong', app: 'windline', name: 'Ride Strong Coaching', url: 'https://livedot.me/ride-strong#cycling', join: 'https://livedot.me/ride-strong#join-cycling', photo: 'https://windline.tech/img/rs.png', kind: 'club', coach: true,
        area: area('Bryanston', -26.06, 28.02), sports: ['road', 'mtb'], sessions: [{ day: 'tue', time: '05:30', place: 'Bryanston Country Club', sport: 'road' }], sessionsLine: 'Tue 05:30 from Bryanston Country Club',
        beginnersWelcome: false, paceGroups: null, whoFor: 'Racers building to a goal event', next: { start: weekly(2, 5, 30), place: 'Bryanston Country Club', kind: 'session' }, km: 5.6, openToAll: false, areaSource: 'set',
        links: { url: 'https://ridestrong.biotree.bio/', biotree: true }, specialties: ['road', 'mtb', 'racing'], format: ['one-to-one', 'online'], qualifications: 'Cycling coach, Level 2' },
    ],
    runfast: [
      { id: 'club:coach-nadia-pillay', app: 'runfast', name: 'Coach Nadia Pillay', url: 'https://livedot.me/coach-nadia-pillay#running', join: null, photo: null, kind: 'club', coach: true,
        area: area('Durban North', -29.791, 31.037), sports: ['road-run'], sessions: [{ day: 'tue', time: '05:30', place: 'Durban beachfront', sport: 'road-run' }, { day: 'sat', time: '05:30', place: 'Durban beachfront', sport: 'road-run' }], sessionsLine: 'Tue 05:30 from Durban beachfront · Sat 05:30 from Durban beachfront',
        beginnersWelcome: true, paceGroups: '5:30–7:00 /km', whoFor: 'Comrades and marathon runners, first-timers too (demo coach)', next: { start: weekly(2, 5, 30), place: 'Durban beachfront', kind: 'session' }, km: 0, openToAll: true, areaSource: 'set', links: null,
        specialties: ['marathon', 'ultra', 'beginners'], format: ['one-to-one', 'group', 'online'], qualifications: 'Demo profile: no real qualification', at: [-29.791, 31.037] },
      { id: 'club:run-lerato', app: 'runfast', name: 'Coach Lerato Running', url: 'https://livedot.me/run-lerato#running', join: 'https://livedot.me/run-lerato#join-running', photo: 'https://runfast.tech/img/rl.png', kind: 'club', coach: true,
        area: area('Sandton', -26.107, 28.056), sports: ['road-run'], sessions: [{ day: 'thu', time: '18:00', place: 'Sandton City', sport: null }], sessionsLine: 'Thu 18:00 from Sandton City',
        beginnersWelcome: true, paceGroups: '5:30–7:30 /km', whoFor: 'First marathons and comebacks', next: { start: weekly(4, 18, 0), place: 'Sandton City', kind: 'session' }, km: 11.2, openToAll: true, areaSource: 'set',
        links: { url: 'https://coachlerato.example/book', biotree: false }, specialties: ['marathon', 'beginners'], format: ['group', 'online'], qualifications: null },
    ],
  };
  if (what === 'coaches') {
    let cl = COACHES[app].filter((x) => (x.at ? Math.hypot((lat - x.at[0]) * 111, (lon - x.at[1]) * 100) : d + x.km) <= km).map(({ at, ...x }) => (at ? { ...x, km: Math.round(Math.hypot((lat - at[0]) * 111, (lon - at[1]) * 100) * 10) / 10 } : x)); // a coach elsewhere (at): their own distance
    if (q.beginners === 'true') cl = cl.filter((x) => x.beginnersWelcome);
    if (q.specialty) cl = cl.filter((x) => x.specialties.includes(q.specialty));
    if (q.format) cl = cl.filter((x) => x.format.includes(q.format));
    return [200, { v: 1, app, query: { lat, lon, km, beginners: q.beginners === 'true', specialty: q.specialty || null, format: q.format || null }, count: cl.length, results: cl }];
  }
  let list = (what === 'clubs' ? CLUBS : EVENTS)[app].filter((x) => d + x.km <= km);
  if (q.sport) list = list.filter((x) => x.sports.includes(q.sport) || (!x.sports.length));
  if (what === 'clubs' && q.beginners === 'true') list = list.filter((x) => x.beginnersWelcome);
  if (what === 'events') { const from = q.from ? Date.parse(q.from + 'T00:00:00Z') : now, to = q.to ? Date.parse(q.to + 'T00:00:00Z') + 864e5 : now + 120 * 864e5; list = list.filter((x) => Date.parse(x.start) >= from && Date.parse(x.start) < to).map((x) => ({ ...x, next: { start: x.start, place: x.area.name, kind: x.kind, name: x.name, url: x.url } })); }
  return [200, { v: 1, app, query: { lat, lon, km }, count: list.length, results: list }];
}
// clubs and their people on the club's live map (GET /api/live/club/<slug>: Findable members only, as the apps answer anyone)
const CLUBS = {
  runfast: { 'durban-striders': { name: 'Durban Striders', logo: 'https://runfast.tech/img/clubs/striders.png', colour: '#123A6B', area: { name: 'Durban', lat: -29.86, lon: 31.02, country: 'ZA' }, members: () => [7, 20, 33, 46, 59, 72, 85, 98].map((i) => RUN[i]) },
    'fourways-striders': { name: 'Fourways Striders', logo: null, colour: '#7A2E0E', area: { name: 'Fourways', lat: -26.01, lon: 28.01, country: 'ZA' }, members: () => [162, 175].map((i) => RUN[i]) },
    'uct-running-club': { name: 'UCT Running Club', logo: 'https://evil.example/logo.png', colour: null, members: () => [111, 124, 137].map((i) => RUN[i]) } },
  windline: { 'durban-striders-cc': { name: 'Durban Striders', logo: null, colour: '#123A6B', area: { name: 'Durban', lat: -29.86, lon: 31.02, country: 'ZA' }, members: () => [11, 24].map((i) => RIDE[i]) },
    'bay-wheelers': { name: 'Bay Wheelers', logo: null, colour: '#0B4F3C', members: () => [9, 22, 35, 48, 61].map((i) => RIDE[i]) } },
};
function route(app, p, q, now) {
  let m;
  if ((m = p.match(/^\/(clubs|events|coaches)\/near$/))) return near(app, m[1], q, now);
  if ((m = p.match(/^\/live\/club\/([a-z0-9-]+)$/))) { const c = CLUBS[app][m[1]]; if (!c) return [404, { error: 'There’s no club at this address.' }];
    const L = c.members().map((x) => (app === 'windline' ? rider(x, now) : runner(x, now))).sort((a, b) => b.km - a.km); return [200, { now, ...(app === 'windline' ? { club: { slug: m[1], name: c.name } } : {}), [app === 'windline' ? 'riders' : 'runners']: L }]; }
  if (p === '/profile' && (q.q || q.slug)) { // clubs (the apps' page search: every word the start of a word in the name)
    const cl = Object.entries(CLUBS[app]).filter(([slug, c]) => (q.slug ? slug === q.slug : hit(c.name + ' ' + slug, q.q))).map(([slug, c]) => ({ v: 1, slug, app, sport: app === 'windline' ? 'cycling' : 'running', type: 'club', name: c.name, logo: c.logo, colour: c.colour, url: `https://${app}.tech/c/${slug}`, members: 30, live: 0 }));
    const co = Object.entries(COACHES[app]).filter(([slug, x]) => (q.slug ? slug === q.slug : hit(x.c.name + ' ' + slug, q.q))).map(([slug, x]) => ({ v: 1, slug, app, sport: app === 'windline' ? 'cycling' : 'running', type: 'coach', coach: true, name: x.c.name, line: x.line, logo: x.logo, colour: null,
      url: x.c.url, members: x.people.length, area: x.area, live: new Set(x.people.map((y) => (y.raceAs || {}).id || 'main')).size * (x.people.length ? 1 : 0), ...(x.demo ? { demo: true } : {}), events: { live: [], upcoming: x.upcoming || [], past: [] } }));
    cl.forEach((c) => { const k = CLUBS[app][c.slug]; c.area = k.area || null; c.coach = false; });
    if (cl.length || co.length) return [200, { now, profiles: [...cl, ...co] }];
  }
  if ((m = p.match(/^\/live\/coach\/([a-z0-9-]+)$/))) { const x = COACHES[app][m[1]]; if (!x) return [404, { error: 'There’s no coach at this address.' }];
    const L = x.people.map((y) => (app === 'windline' ? rider(y, now) : runner(y, now))).sort((a, b) => b.km - a.km), rOf = (v) => (app === 'windline' ? v.event : v.race);
    const races = []; L.forEach((v) => { const r = rOf(v), e = races.find((z) => z.id === r.id); if (e) e.count++; else races.push({ id: r.id, name: r.name, count: 1 }); }); races.sort((a, b) => b.count - a.count);
    const key = app === 'windline' ? 'riders' : 'runners';
    if (q.race) { const r = races.find((z) => z.id === q.race); if (!r) return [404, { error: 'There’s no race at this address.' }]; return [200, { now, coach: x.c, race: { id: r.id, name: r.name }, [key]: L.filter((v) => rOf(v).id === r.id) }]; }
    return [200, { now, coach: x.c, races, ...(races.length === 1 ? { race: { id: races[0].id, name: races[0].name }, [key]: L } : {}) }]; }
  if (app === 'windline' && p === '/event/find') { // Windline's tourfind.js, stood in for: a tour's name words and its page's name; a word in no tour counts against none
    const ws = (t) => words(String(t).replace(/['\u2019]s\b/g, '')).filter((w) => !['the', 'a', 'of', 'tour', 'tours', 's', 'where', 'is'].includes(w)), qw = ws(q.q || '');
    const sc = Object.entries(TOURS).map(([slug, t]) => { const nw = ws(t.name), bw = ws(t.pageName || ''), inName = qw.filter((w) => nw.some((y) => y.startsWith(w))).length; return { slug, t, inName, n: inName + qw.filter((w) => !nw.some((y) => y.startsWith(w)) && bw.some((y) => y.startsWith(w))).length }; }).filter((x) => x.inName);
    const top = Math.max(0, ...sc.map((x) => x.n)); return [200, { tours: sc.filter((x) => x.n === top).map((x) => ({ slug: x.slug, name: x.t.name, by: x.t.pageName || null, url: 'https://tour.windline.tech/' + x.slug })) }];
  }
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
    const L = people.filter((x) => hit(x.name, t)).slice(0, 20).map(live); return [200, { now, [key]: app === 'windline' ? L : L.map((v) => ({ pid: v.pid, name: v.name, photo: null, race: { id: 'comrades-preview', name: v.race.name, kind: 'race' }, live: ['live', 'paused', 'delayed', 'nosignal'].includes(v.status), team: v.team })) }]; }
  if ((m = p.match(/^\/live\/(rider|runner)$/))) { const ids = String(q.pids || '').split(','); const pool = new Map([...people, ...EXTRA[app]].map((x) => [x.pid, x])); return [200, { now, [key]: [...pool.values()].filter((x) => ids.includes(x.pid)).map(live) }]; }
  if ((m = p.match(/^\/live\/race\/([\w-]+)$/))) { if (m[1] !== rid) return [404, { error: 'There’s no race at this address.' }];
    const t = String(q.q || ''), all = people.map(live).sort((a, b) => b.km - a.km);
    return [200, { now, count: people.length, ...(t ? {} : { taps: { total: 4242, day: null } }), [key]: t.replace(/[^A-Za-z]/g, '').length >= 3 ? all.filter((v) => hit(v.name, t)).slice(0, 20) : all.slice(0, 50) }]; }
  if ((m = p.match(/^\/race\/([\w-]+)$/))) { if (m[1] !== rid) return [404, { error: 'There’s no race at this address.' }];
    return [200, app === 'windline' ? { ...coast, id: rid, name: 'Coast Classic (preview)', start: new Date(gun(now, 4.2)).toISOString() } : { ...comrades, id: rid, name: 'Comrades (preview)', start: new Date(gun(now, 6.1)).toISOString() }]; }
  if ((m = p.match(/^\/live\/h\/([\w-]+)$/))) { const x = people.find((y) => y.handle === m[1]); return x ? [200, { now, handle: x.handle, [key]: [live(x)] }] : [404, { error: 'They may have changed or released it.' }]; }
  if ((m = p.match(/^\/live\/f\/(\w+)$/))) { const x = m[1] === 'demo' ? people[5] : m[1] === 'priv01' && app === 'runfast' ? PRIV : null; return x ? [200, { now, [key]: [live(x)] }] : [404, { error: 'That link has been reset.' }]; }
  if (app === 'windline' && (m = p.match(/^\/handle\/([\w-]+)$/))) {
    const r = RUN.find((y) => y.handle === m[1]), w = RIDE.find((y) => y.handle === m[1]), x = r || w, a = r ? 'runfast' : 'windline';
    if (!x) return [200, { now, handle: null, state: 'unknown' }];
    const v = r ? runner(r, now) : rider(w, now), nm = x.name; // their own page: their full name (Wes, 18 Oct)
    return [200, { now, v: 1, handle: x.handle, url: 'https://livedot.me/' + x.handle, index: true, person: { name: nm, photo: null, team: x.team || null }, apps: [a], state: 'live',
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
    if (b.tour === 'pacific-coast-tour') return j(200, { ok: true, demo: true, tour: 'Pacific Coast Tour', organiser: null, named: !!b.name, count: null });
    if (b.tour) { if (!/campfire/.test(b.tour)) return j(404, { ok: false, error: 'That tour isn’t open for taps on the back.' }); return j(200, { ok: true, tour: 'Karoo Campfire Tour', organiser: 'Alistair’s Cycle Tours', named: !!(b.name || req.headers.authorization), count: 4 }); }
    const who = b.handle || b.pid || b.code || '';
    if (/^(pprivate|private)/.test(who)) return j(404, { ok: false, error: 'They aren’t live just now.' });
    if (/tapsoff/.test(who)) return j(403, { ok: false, error: 'They’ve turned taps on the back off.' });
    if (/again/.test(who)) return j(429, { ok: false, error: 'You can give them another in a minute.' });
    if (/finished/.test(who)) return j(200, { ok: true, named: !!b.name, count: 12, finished: true, first: 'Lerato' });
    return j(200, { ok: true, named: !!(b.name || req.headers.authorization), count: 7, finished: false, first: 'Megan', signedIn: !!req.headers.authorization });
  }
  if (p === '/route') {
    if (b.url && /^https:\/\/files\.oaiusercontent\.test\//.test(b.url)) { MCP_SEEN.push({ tool: 'route', args: { url: b.url } }); // a file ChatGPT passed (its download link): the reader fetches it; stood in for with a short route near Fourways
      const pts = Array.from({ length: 40 }, (_, i) => [-26.0 + i * 0.002, 28.0 + i * 0.0025, null]); return j(200, { ok: true, routes: [{ name: 'Track 1', from: '', to: '', km: 12.4, climb: 80, pts }] }); }
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
  // /quiet/<app>/api/…: the same, with no race live (as production is most of the day: only the demos run)
  const u = new URL(req.url, 'http://x'), m = u.pathname.match(/^\/(quiet\/)?(windline|runfast)\/api(\/.*?)\/?$/), now = Date.now();
  const [code, body] = m ? (m[1] && m[3] === '/profile' && u.searchParams.get('live') ? [200, { now, total: 0, people: 0, countries: 0, events: [], next: null }] : route(m[2], m[3], Object.fromEntries(u.searchParams), now)) : [404, { error: 'Not found' }];
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`fixture API on http://localhost:${PORT} (sample data)`));
