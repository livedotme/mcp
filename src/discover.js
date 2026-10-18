// find_clubs and find_events (Wes, 17 Oct: "best running club to join in Fourways"; directive handoffs/2026-10-17-find-clubs-events-
// directive.md §3 on Windline). Clubs, organisers and their public events near a place, from the apps' own public reads:
//   GET windline.tech/api/clubs/near, /api/events/near   (cycling)
//   GET runfast.tech/api/clubs/near,  /api/events/near    (running)
// The contract: Windline handoffs/2026-10-17-clubs-near-contract.md. Approved clubs and organisers only, never a person, never a
// private event; the apps decide that, and whatever they leave out stays out. The place is turned into a point here (Photon, as
// plan_route reads a route's towns), never sent to the apps as words. The weather on each row is the one engine's: the forecast
// within its 10 days, else 10 years of weather on that date (eventweather.js weatherAt). Each row's Join (or I'm in) opens the
// club or event page, where sign-in or a free account is the same step. The same rules for the demo as for everything else.
import { getJson, NAME } from './reads.js';
import { unitsFor, hostRegion } from './words.js';
import { weatherAt } from './eventweather.js';
import { zoneAt } from './writes.js';

const CYCLING = ['road', 'gravel', 'mtb', 'tours'], RUNNING = ['road-run', 'trail-run'];
const SPORTS = ['cycling', 'running', ...CYCLING.slice(0, 3), ...RUNNING, 'tours'];
const SPORT_WORDS = { road: 'road cycling', gravel: 'gravel', mtb: 'mountain biking', 'road-run': 'road running', 'trail-run': 'trail running', tours: 'multi-day tours', cycling: 'cycling', running: 'running' };
const KINDS = { race: ['race'], tour: ['tour'], 'club ride': ['ride', 'run'], 'club run': ['run'], run: ['run'], ride: ['ride'] };
// A club that isn't listed can ask to be added (Wes, 17 Oct): Windline's page application (cycling) and RunFast's Add your club (running)
const r3 = (x) => Math.round(Number(x) * 1000) / 1000; // the place is rounded to about 100 m before it leaves livedot, so no server log holds the exact point (KPMG, 17 Oct)
export const ADD_CLUB = { cycling: 'https://windline.tech/pages/?from=livedot-mcp#apply', running: 'https://runfast.tech/app/?ref=livedot-mcp#/clubs/add' };
const addLine = (sport) => { const run = RUNNING.includes(sport) || sport === 'running', cyc = sport && !run;
  return `Run a club that isn't listed? Add it free: ${run ? `running ${ADD_CLUB.running}` : cyc ? `cycling ${ADD_CLUB.cycling}` : `cycling ${ADD_CLUB.cycling} · running ${ADD_CLUB.running}`}`; };
const ROWS = 10, WEATHER_ROWS = 6, MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const PLACE = new Set(['suburb', 'neighbourhood', 'quarter', 'village', 'town', 'city', 'hamlet', 'locality', 'district', 'borough', 'municipality', 'county', 'state', 'island']);

const UNITS = { type: 'string', enum: ['metric', 'imperial'], description: 'Pass the asker\'s units: imperial for users in the US, UK road distances, Liberia or Myanmar, or when they ask in miles/°F; otherwise metric.' };
const PLACE_ARG = { type: 'string', description: 'The suburb, town or city, as the user said it, e.g. "Fourways", "Durban North", "Cape Town".' };
const SPORT_ARG = { type: 'string', enum: SPORTS, description: 'cycling or running, or one sport: road, gravel, mtb, road-run, trail-run, tours (multi-day tours). Leave it out for both.' };

/** The two tools as server.js lists them (it adds the widget meta and the read-only annotations). */
export const discoverTools = ({ READ_ONLY, uiMeta }) => [
  {
    name: 'find_clubs',
    title: 'Find a club near a place',
    description: 'Find running and cycling clubs near a place, e.g. best running club to join in Fourways, beginner cycling group near Sandton. '
      + 'Lists approved clubs and organisers on Windline (cycling) and RunFast (running) nearest first, with their weekly sessions, whether beginners are welcome, whether anyone can join (Open to anyone) or it\'s members only, their pace groups, their next session with its weather, the club\'s own links page when it has one, and a Join link to the club\'s page. '
      + 'Set beginners for "beginner friendly", "new to running", "for beginners"; set open for "open to anyone", "anyone can join", "no membership", "don\'t need to be a member". '
      + 'Only clubs that have added their area show; never a person. Say what each club chose to share, and nothing more.',
    inputSchema: {
      type: 'object',
      properties: { place: PLACE_ARG, sport: SPORT_ARG, beginners: { type: 'boolean', description: 'true when the user wants a beginner-friendly club ("beginner friendly", "new to cycling").' },
        open: { type: 'boolean', description: 'true for only clubs open to anyone (no membership needed): "open to anyone", "anyone can join", "no membership".' },
        km: { type: 'number', description: 'How far from the place, in km (1 to 100). Leave it out for 25 km.' }, units: UNITS },
      required: ['place'],
      additionalProperties: false,
    },
    annotations: { title: 'Find a club near a place', ...READ_ONLY },
    _meta: uiMeta('Finding clubs near there…', 'Clubs'),
  },
  {
    name: 'find_events',
    title: 'Find rides, runs, races and tours near a place',
    description: 'Find public cycling and running events near a place and when: races, multi-day tours, club rides and club runs on Windline and RunFast, e.g. trail runs near Cape Town in November, cycle tours around Johannesburg. '
      + 'Each with its date, where it starts, the weather (the forecast within 10 days, typical weather beyond), its club or organiser and an I\'m in link to its page. Only published public events of approved clubs and organisers.',
    inputSchema: {
      type: 'object',
      properties: { place: PLACE_ARG, sport: SPORT_ARG, when: { type: 'string', description: 'When, as the user said it: "November", "this weekend", "next month", "2026-11-14", or "2026-11-01 to 2026-11-30". Leave it out for the next four months.' },
        kind: { type: 'string', enum: ['race', 'tour', 'club ride', 'club run'], description: 'Only races, only multi-day tours, or only club rides or runs.' },
        km: { type: 'number', description: 'How far from the place, in km (1 to 100). Leave it out for 50 km.' }, units: UNITS },
      required: ['place'],
      additionalProperties: false,
    },
    annotations: { title: 'Find events near a place', ...READ_ONLY },
    _meta: uiMeta('Finding events near there…', 'Events'),
  },
];

// ---------------------------------------------------------------- the place: words → a point (Photon), held a day
// Ranked here, not left to Photon's first result or to "places only" (17 Oct: "Lanseria" landed in France, because the best match
// is an airport, not a town): how well the name matches, what kind of thing it is (a town beats a street; an airport or a nature
// reserve is a fine point; a bus stop or a bar barely counts), Photon's own order, and the asker's country or location when the host
// says it (ChatGPT's openai/userLocation, else the locale's country). Two countries nearly level with no hint: ask which.
const placeMemo = new Map();
const MAJOR = new Set(['aerodrome', 'airport', 'nature_reserve', 'national_park', 'park', 'university', 'college', 'stadium', 'museum', 'attraction', 'mall', 'station', 'train_station', 'industrial', 'commercial', 'residential', 'retail', 'golf_course', 'sports_centre']);
const MINOR = new Set(['bus_stop', 'stop', 'platform', 'bar', 'pub', 'cafe', 'restaurant', 'shop', 'post_office', 'school', 'motorway_junction', 'water', 'stream', 'lake', 'river']);
/** Each country's middle, for Photon's bias when the host gives a country but no point. */
const CENTRE = { ZA: [-29, 24.5], US: [39.5, -98.5], GB: [54, -2], IE: [53.2, -8], AU: [-25, 134], NZ: [-41, 174], CA: [56, -106], FR: [46.5, 2.5], DE: [51, 10], NL: [52.2, 5.3], BE: [50.6, 4.6],
  ES: [40, -3.7], PT: [39.5, -8], IT: [42.8, 12.5], CH: [46.8, 8.2], AT: [47.5, 14.5], SE: [62, 15], NO: [62, 10], DK: [56, 10], FI: [64, 26], PL: [52, 19.5], KE: [0, 38], NA: [-22, 17], BW: [-22, 24],
  ZW: [-19, 29.5], MZ: [-18, 35], LS: [-29.6, 28.2], SZ: [-26.5, 31.5], NG: [9, 8], GH: [7.9, -1], IN: [22, 79], SG: [1.35, 103.8], AE: [24, 54], JP: [36, 138], BR: [-10, -52], MX: [23, -102], AR: [-34, -64], CL: [-33, -71] };
const pw = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
/** Where the asker is, as the host says it: { country, lat, lon } (lat and lon from openai/userLocation, else the country's middle). */
export function placeHint(meta) {
  const m = meta || {}, loc = m['openai/userLocation'] || m.userLocation || null, country = hostRegion(m) || null;
  const la = loc && +(loc.latitude ?? loc.lat), lo = loc && +(loc.longitude ?? loc.lon ?? loc.lng);
  if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { country, lat: la, lon: lo, exact: true };
  return country ? { country, lat: CENTRE[country] ? CENTRE[country][0] : null, lon: CENTRE[country] ? CENTRE[country][1] : null, exact: false } : null;
}
const hkm = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
/** Photon's features for q → { pick } or { ask: [label, label] } (no hint, and Photon's own top two are in two countries and score
 *  nearly level) or null. Pure: tests run it on recorded answers. */
export function rankPlaces(features, q, hint) {
  const qw = pw(q), qs = qw.join(' ');
  const all = (features || []).map((f, i, arr) => { const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
    const name = p.name || p.city || '', nw = pw(name), ns = nw.join(' '), value = p.osm_value || '', key = p.osm_key || '';
    const m = !qs ? 0 : ns === qs ? 3 : (' ' + ns + ' ').includes(' ' + qs + ' ') ? 2 : qw.every((w) => nw.some((y) => y.startsWith(w)) || pw(p.city).some((y) => y.startsWith(w))) ? 1 : 0;
    const isPlace = key === 'place' || key === 'boundary' || PLACE.has(value) || p.type === 'city' || p.type === 'district' || p.type === 'locality' && key === 'place';
    const kind = isPlace ? 3 : MAJOR.has(value) || key === 'aeroway' || key === 'leisure' || key === 'tourism' ? 2 : key === 'highway' && !MINOR.has(value) ? 1 : MINOR.has(value) ? 0 : 1;
    return { name, city: p.city || '', state: p.state || '', country: (p.countrycode || '').toUpperCase(), countryName: p.country || '', lat: +c[1], lon: +c[0], value, key, isPlace, m, kind, i, order: 2 * (1 - (0.9 * i) / Math.max(1, arr.length)) }; // Photon's order is its sense of importance
  }).filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon));
  if (!all.length) return null;
  const matched = all.filter((x) => x.m > 0), list = matched.length ? matched : all.filter((x) => x.isPlace).concat(all.filter((x) => !x.isPlace)).slice(0, 1); // no name matches: Photon's best place, as before (a typo)
  for (const x of list) {
    x.s = x.m + x.kind + (x.isPlace && x.value === 'city' ? 0.5 : 0) + x.order;
    if (hint && hint.country && x.country === hint.country) x.s += 2;
    if (hint && hint.exact && hkm([hint.lat, hint.lon], [x.lat, x.lon]) < 300) x.s += 1;
  }
  list.sort((a, b) => b.s - a.s || a.i - b.i);
  const a = list[0], b = list.find((x) => x.country !== a.country);
  if (!hint && b && b.i <= 1 && a.s - b.s < 1) return { ask: [a, b].map(labelOf), candidates: [a, b] }; // Photon's own top two, in two countries, nearly level
  return { pick: a };
}
function displayName(x, q) {
  if (x.isPlace) return x.name;
  const at = pw(x.name).join(' ').indexOf(pw(q).join(' ')), qn = String(q || '').trim(), base = at === 0 && pw(qn).length ? x.name.split(/\s+/).slice(0, pw(qn).length).join(' ') : x.name;
  if (x.key === 'aeroway' || x.value === 'aerodrome' || x.value === 'airport') return `${base} (airport area)`;
  if (x.value === 'station' || x.value === 'train_station') return `${base} (station area)`;
  if (x.key === 'highway') return `${x.name} area`;
  return x.name;
}
const labelOf = (x) => [x.isPlace ? x.name : displayName(x, x.name), x.city && x.city !== x.name ? x.city : '', x.state && x.state !== x.city ? x.state : '', x.countryName].filter(Boolean).join(', ');
/** "Fourways" → { name, label, lat, lon, country } or { ask: ["Lanseria, South Africa", "Lanseria, France"] } or null. */
export async function placeOf(q, hint = null) {
  const key = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80); if (!key) return null;
  const mk = key + '|' + (hint ? `${hint.country || ''}|${hint.exact ? Math.round(hint.lat) + ',' + Math.round(hint.lon) : ''}` : ''), hit = placeMemo.get(mk);
  if (hit && Date.now() - hit.at < 864e5) return hit.p;
  const bias = hint && Number.isFinite(hint.lat) && Number.isFinite(hint.lon) ? `&lat=${(+hint.lat).toFixed(2)}&lon=${(+hint.lon).toFixed(2)}` : ''; // rounded: the asker's point never leaves at full precision
  const r = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(key)}&limit=10&lang=en${bias}`, 3500);
  const R = rankPlaces((r.ok && r.body && r.body.features) || [], q, hint);
  let out = null;
  if (R && R.ask) out = { ask: R.ask };
  else if (R && R.pick) { const p = R.pick, nm = displayName(p, q); out = { name: nm, label: [nm, p.city && p.city !== p.name ? p.city : '', p.state && p.state !== p.city ? p.state : '', p.countryName].filter(Boolean).join(', '), lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), country: p.country || null }; }
  if (r.ok) { if (placeMemo.size > 500) placeMemo.clear(); placeMemo.set(mk, { at: Date.now(), p: out }); }
  return out;
}

// ---------------------------------------------------------------- when: words → a window of days (the place's own calendar)
const ymdIn = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date(ms));
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dow = (ymd) => new Date(ymd + 'T12:00:00Z').getUTCDay();
/** "November", "this weekend", "2026-11-14" → { from, to (YYYY-MM-DD, inclusive), words } or null when it isn't a time we know. */
export function windowOf(when, tz, now = Date.now()) {
  const w = String(when || '').trim().toLowerCase(); if (!w) return null;
  const today = ymdIn(now, tz), [Y, M] = today.split('-').map(Number);
  let m;
  if ((m = w.match(/^(\d{4}-\d{2}-\d{2})(?:\s*(?:to|until|-|–)\s*(\d{4}-\d{2}-\d{2}))?$/))) return { from: m[1], to: m[2] || m[1], words: m[2] ? `${m[1]} to ${m[2]}` : m[1] };
  if (w === 'today') return { from: today, to: today, words: 'today' };
  if (w === 'tomorrow') return { from: addDays(today, 1), to: addDays(today, 1), words: 'tomorrow' };
  if (/^(this )?weekend$|^next weekend$/.test(w)) {
    const d = dow(today), sat = d === 0 ? addDays(today, -1) : addDays(today, (6 - d + 7) % 7), plus = /^next/.test(w) ? 7 : 0;
    return { from: d === 0 && !plus ? today : addDays(sat, plus), to: addDays(sat, plus + 1), words: /^next/.test(w) ? 'next weekend' : 'this weekend' };
  }
  if (w === 'this week') return { from: today, to: addDays(today, (7 - dow(today)) % 7), words: 'this week' };
  if (w === 'next week') { const mon = addDays(today, ((8 - dow(today)) % 7) || 7); return { from: mon, to: addDays(mon, 6), words: 'next week' }; }
  const month = (y, mo) => { const from = `${y}-${String(mo).padStart(2, '0')}-01`, last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); return { from: from < today ? today : from, to: last }; };
  if (w === 'this month') return { ...month(Y, M), words: 'this month' };
  if (w === 'next month') return { ...month(M === 12 ? Y + 1 : Y, M === 12 ? 1 : M + 1), words: 'next month' };
  if ((m = w.match(/^(?:in )?([a-z]+)(?:\s+(\d{4}))?$/)) && MONTHS.some((x) => x.startsWith(m[1]) && m[1].length >= 3)) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m[1])) + 1, y = m[2] ? +m[2] : mo < M ? Y + 1 : Y;
    const r = month(y, mo); if (r.to < today) return null;
    return { ...r, words: `in ${MONTHS[mo - 1][0].toUpperCase() + MONTHS[mo - 1].slice(1)}${m[2] ? ' ' + m[2] : ''}` };
  }
  return null;
}

// ---------------------------------------------------------------- the apps' answers
const appsFor = (sport) => (!sport ? ['windline', 'runfast'] : RUNNING.includes(sport) || sport === 'running' ? ['runfast'] : ['windline']);
const apiSport = (sport) => (sport === 'cycling' || sport === 'running' ? '' : sport || '');
async function near(R, what, apps, qs) {
  const rs = await Promise.all(apps.map((a) => R.near(a, what, qs)));
  const ok = rs.some((r) => r.ok);
  return { ok, failed: apps.filter((a, i) => !rs[i].ok), list: rs.flatMap((r) => (r.ok && r.body && Array.isArray(r.body.results) ? r.body.results : [])).sort((a, b) => a.km - b.km || String(a.name).localeCompare(String(b.name))) };
}

const longDay = (iso, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
const hm = (iso, tz, f) => (f && f.U.temp === 'f' ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) : new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })).format(new Date(iso)); // 06:00, as the clubs write their sessions (6:00 AM in the US)
const distOf = (km, f) => (km < 0.5 ? 'right there' : `${f.dist(km)} away`);
const KIND_WORD = { session: 'session', ride: 'club ride', run: 'club run', race: 'race', tour: 'tour' };

/** The next session's or event's weather, for the first rows at once (a few seconds at most: an answer never waits on it). */
async function withWeather(R, rows, f, now) {
  const jobs = rows.slice(0, WEATHER_ROWS).map((x) => {
    const n = x.next, a = x.area; if (!n || !n.start || !a) return Promise.resolve();
    return weatherAt(R, { lat: a.lat, lon: a.lon, startMs: Date.parse(n.start), sport: x.app === 'runfast' ? 'run' : 'ride' }, f, now).then((w) => { x.weather = w; }).catch(() => null);
  });
  let t; await Promise.race([Promise.all(jobs), new Promise((ok) => { t = setTimeout(ok, 9000); })]); clearTimeout(t);
}

/** Whose weather the rows show (WeatherKit's terms: Apple's mark and legal link wherever its forecast shows; ERA5 credits Copernicus):
 *  { basis, forecast_updated } for the server's Apple Weather line, the card's credit, and the text's Copernicus line. */
function credits(rows) {
  const fc = rows.filter((x) => x.weather && x.weather.basis === 'forecast'), ty = rows.filter((x) => x.weather && x.weather.basis === 'typical');
  const at = fc.map((x) => x.weather.fetched).filter((t) => isFinite(t) && t > 0);
  return { basis: fc.length && ty.length ? 'mixed' : fc.length ? 'forecast' : ty.length ? 'historic' : null, forecast_updated: fc.length ? new Date(at.length ? Math.min(...at) : Date.now()).toISOString() : null,
    updated: [fc.length ? 'Apple Weather' : '', ty.length ? 'Copernicus ERA5 (contains modified Copernicus Climate Change Service information)' : ''].filter(Boolean).join(' · '),
    line: ty.length ? '\nWeather records: Copernicus ERA5 (contains modified Copernicus Climate Change Service information).' : '' };
}
function nextLine(x, f, words) {
  const n = x.next; if (!n || !n.start) return '';
  const tz = x.tz, w = x.weather;
  return `${words ? 'Next: ' : ''}${longDay(n.start, tz)} ${hm(n.start, tz, f)}${n.place ? ` at ${n.place}` : ''}${n.kind && n.kind !== 'session' && words ? ` (${n.name ? n.name : KIND_WORD[n.kind]})` : ''}${w ? `, ${w.text}` : ''}`;
}
const tz0 = (x) => (x.area && zoneAt([x.area.lat, x.area.lon])) || 'UTC';

// ---------------------------------------------------------------- find_clubs
/** A club's own link-in-bio page (kit shop, socials, WhatsApp group): https only, checked here; Biotree's when the hostname is
 *  biotree.bio or under it (read from the hostname, not the app's flag). */
const linksOf = (x) => { const u = x.links && typeof x.links.url === 'string' && /^https:\/\//i.test(x.links.url) ? x.links.url : null; if (!u) return null;
  try { return { url: u, biotree: /(^|\.)biotree\.bio$/i.test(new URL(u).hostname) }; } catch (e) { return null; } };
export async function findClubs(ctx, args, sponsor) {
  const { R, now } = ctx, sport = SPORTS.includes(args.sport) ? args.sport : null, beginners = args.beginners === true, open = args.open === true;
  const P = await placeOf(args.place, placeHint(ctx.meta));
  if (P && P.ask) { const t = `Which do you mean: ${P.ask[0]}, or ${P.ask[1]}? Ask the user, then call again with the place and its country ("${P.ask[0]}").`; return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t, places: P.ask }, map: null }; }
  if (!P) { const t = `I couldn't find "${String(args.place || '').slice(0, 60)}" on the map. Which suburb or town is it near?`; return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t }, map: null, miss: 'no_place' }; }
  const f = unitsFor(args.units, null, zoneAt([P.lat, P.lon]));
  let km = Math.min(100, Math.max(1, Math.round(+args.km || 25))), wider = false;
  const qs = (k) => `lat=${r3(P.lat)}&lon=${r3(P.lon)}&km=${k}${apiSport(sport) ? '&sport=' + apiSport(sport) : ''}${beginners ? '&beginners=true' : ''}`;
  let r = await near(R, 'clubs', appsFor(sport), qs(km));
  if (open && r.ok) r.list = r.list.filter((x) => x.openToAll === true); // the apps don't take it: only clubs that said Open to anyone
  if (r.ok && !r.list.length && !args.km && km < 50) { km = 50; wider = true; r = await near(R, 'clubs', appsFor(sport), qs(km)); if (open && r.ok) r.list = r.list.filter((x) => x.openToAll === true); }
  const what = `${open ? 'open-to-anyone ' : ''}${beginners ? 'beginner-friendly ' : ''}${sport && sport !== 'tours' ? SPORT_WORDS[sport] + ' ' : sport === 'tours' ? 'tour ' : ''}clubs`;
  if (!r.ok) { const t = `I couldn't reach the club lists just now. Try again in a moment.`; return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t, error: t }, map: null }; }
  if (!r.list.length) {
    const t = `I don't know any ${what} within ${f.dist(km)} of ${P.label} yet. Clubs show up here once they add their area on Windline (cycling) or RunFast (running).`;
    return { text: `${t}\n${addLine(sport)}\n\n${sponsor}`, structured: { view: 'none', message: t, place: P.label, add_club: ADD_CLUB }, map: null };
  }
  const rows = r.list.slice(0, ROWS).map((x) => ({ ...x, tz: tz0(x) }));
  await withWeather(R, rows, f, now);
  const head = `${what[0].toUpperCase() + what.slice(1)} near ${P.label}, nearest first${wider ? ` (none within 25 km, so within ${f.dist(km)})` : ''}:`;
  const lines = rows.map((x, i) => {
    const bits = [`${i + 1}. ${x.name} (${NAME[x.app]}${x.kind === 'organiser' ? ', organiser' : ''}): ${distOf(x.km, f)}${x.area ? `, ${x.area.name}` : ''}.`];
    if (x.whoFor) bits.push(`For ${x.whoFor.replace(/^for\s+/i, '').replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}.`);
    if (x.sessionsLine) bits.push(`${x.sessionsLine}.`);
    const tags = [x.openToAll === true ? 'Open to anyone' : x.openToAll === false ? 'Members only' : '', x.beginnersWelcome ? 'Beginners welcome' : '', x.paceGroups ? `pace groups ${x.paceGroups}` : ''].filter(Boolean).join('; '); if (tags) bits.push(tags[0].toUpperCase() + tags.slice(1) + '.');
    const nx = nextLine(x, f, true); if (nx) bits.push(nx + '.');
    const L = linksOf(x); if (L) bits.push(`Club links: ${L.url}`);
    bits.push(`Join: ${x.join || x.url}`);
    return bits.join(' ');
  });
  const more = r.list.length > rows.length ? `\n${r.list.length - rows.length} more further out.` : '';
  const W = credits(rows);
  const text = `${head}\n${lines.join('\n')}${more}${W.line}\nEach club's page shows what it chose to share. Join opens it, with sign-in or a free account in the same step.\n${addLine(sport)}\n\n${sponsor}`;
  const runOnly = rows.every((x) => x.app === 'runfast');
  const S = { view: 'clubs', place: P.label, km, sport, beginners, open, app: runOnly ? 'runfast' : 'windline', units: f.system, sponsor_line: sponsor, add_club: ADD_CLUB, basis: W.basis, forecast_updated: W.forecast_updated,
    clubs: rows.map((x) => ({ id: x.id, app: x.app, name: x.name, kind: x.kind, url: x.url, join: x.join || x.url, photo: x.photo || null, km: x.km, area: x.area ? x.area.name : null,
      sports: x.sports || [], sessions: x.sessionsLine || null, beginners_welcome: !!x.beginnersWelcome, open_to_all: typeof x.openToAll === 'boolean' ? x.openToAll : null,
      links: linksOf(x), pace_groups: x.paceGroups || null, who_for: x.whoFor || null,
      next: x.next ? { start: x.next.start, place: x.next.place || null, kind: x.next.kind, weather: x.weather ? x.weather.text : null, weather_basis: x.weather ? x.weather.basis : null } : null })) };
  const map = { kind: 'list', list: 'clubs', sport: runOnly ? 'run' : 'ride', title: `${what[0].toUpperCase() + what.slice(1)} near ${P.name}`, subtitle: `${rows.length} nearest${wider ? `, within ${f.dist(km)}` : ''} · ${P.label}`,
    items: rows.map((x) => ({ name: x.name, photo: x.photo || null, app: x.app, sub: [distOf(x.km, f), x.area && x.area.name, NAME[x.app]].filter(Boolean).join(' · '), line: x.sessionsLine || '',
      tags: [x.openToAll === true ? 'Open to anyone' : '', x.beginnersWelcome ? 'Beginners welcome' : '', x.paceGroups ? `Pace ${x.paceGroups}` : ''].filter(Boolean), next: nextLine(x, f, false), weather: x.weather ? x.weather.basis : null,
      links: linksOf(x), url: x.url, button: { label: 'Join', url: x.join || x.url } })),
    updated: W.updated, add: { label: 'Is your club missing? Add it free', url: RUNNING.includes(sport) || sport === 'running' || runOnly ? ADD_CLUB.running : ADD_CLUB.cycling },
    sponsor, units: f.system };
  return { text, structured: S, map };
}

// ---------------------------------------------------------------- find_events
export async function findEvents(ctx, args, sponsor) {
  const { R, now } = ctx, sport = SPORTS.includes(args.sport) ? args.sport : null, kinds = KINDS[args.kind] || null;
  const P = await placeOf(args.place, placeHint(ctx.meta));
  if (P && P.ask) { const t = `Which do you mean: ${P.ask[0]}, or ${P.ask[1]}? Ask the user, then call again with the place and its country ("${P.ask[0]}").`; return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t, places: P.ask }, map: null }; }
  if (!P) { const t = `I couldn't find "${String(args.place || '').slice(0, 60)}" on the map. Which suburb or town is it near?`; return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t }, map: null, miss: 'no_place' }; }
  const tz = zoneAt([P.lat, P.lon]) || 'UTC', f = unitsFor(args.units, null, tz);
  const Wd = windowOf(args.when, tz, now), unknownWhen = args.when && !Wd;
  let km = Math.min(100, Math.max(1, Math.round(+args.km || 50))), wider = false;
  const qs = (k) => `lat=${r3(P.lat)}&lon=${r3(P.lon)}&km=${k}${apiSport(sport) ? '&sport=' + apiSport(sport) : ''}${Wd ? `&from=${Wd.from}&to=${Wd.to}` : ''}`;
  const pick = (list) => list.filter((x) => !kinds || kinds.includes(x.kind));
  let r = await near(R, 'events', appsFor(sport), qs(km)), list = pick(r.list);
  if (r.ok && !list.length && !args.km && km < 100) { km = 100; wider = true; r = await near(R, 'events', appsFor(sport), qs(km)); list = pick(r.list); }
  const what = `${sport && sport !== 'tours' ? SPORT_WORDS[sport] + ' ' : ''}${args.kind === 'race' ? 'races' : args.kind === 'tour' || sport === 'tours' ? 'tours' : args.kind ? args.kind + 's' : 'events'}`;
  const when = Wd ? ` ${Wd.words}` : '';
  if (!r.ok) { const t = `I couldn't reach the event lists just now. Try again in a moment.`; return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t, error: t }, map: null }; }
  if (!list.length) {
    const t = `I don't know any public ${what} within ${f.dist(km)} of ${P.label}${when || ' in the next four months'} yet.${unknownWhen ? ` (I read "${String(args.when).slice(0, 40)}" as the next four months.)` : ''}`;
    return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t, place: P.label }, map: null };
  }
  // soonest first among the near ones: the list a person scans to pick a date
  const rows = list.slice(0, ROWS).map((x) => ({ ...x, tz: tz0(x) })).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.km - b.km);
  await withWeather(R, rows, f, now);
  const head = `${what[0].toUpperCase() + what.slice(1)} near ${P.label}${when}${wider ? ` (within ${f.dist(km)})` : ''}, soonest first:`;
  const lines = rows.map((x, i) => {
    const kindWord = KIND_WORD[x.kind] || x.kind, by = x.club ? `, by ${x.club.name}` : '';
    const bits = [`${i + 1}. ${x.name} (${kindWord} on ${NAME[x.app]}${by}): ${longDay(x.start, x.tz)} ${hm(x.start, x.tz, f)}${x.area && x.area.name ? `, from ${x.area.name}` : ''}, ${distOf(x.km, f)}.`];
    if (x.weather) bits.push(`${x.weather.text}.`);
    if (x.beginnersWelcome) bits.push('Beginners welcome.');
    bits.push(`Details: ${x.url}`); if (x.join && x.join !== x.url) bits.push(`I'm in: ${x.join}`);
    return bits.join(' ');
  });
  const more = list.length > rows.length ? `\n${list.length - rows.length} more further out.` : '';
  const W = credits(rows);
  const text = `${head}\n${lines.join('\n')}${more}${W.line}${unknownWhen ? `\n(I read "${String(args.when).slice(0, 40)}" as the next four months.)` : ''}\nWeather: the forecast within 10 days, typical weather on that date beyond it.\n\n${sponsor}`;
  const runOnly = rows.every((x) => x.app === 'runfast');
  const S = { view: 'events', place: P.label, km, sport, when: Wd ? { from: Wd.from, to: Wd.to } : null, basis: W.basis, forecast_updated: W.forecast_updated, app: runOnly ? 'runfast' : 'windline', units: f.system, sponsor_line: sponsor,
    events: rows.map((x) => ({ id: x.id, app: x.app, name: x.name, kind: x.kind, url: x.url, join: x.join || x.url, photo: x.photo || null, km: x.km, start: x.start, area: x.area ? x.area.name : null,
      club: x.club ? x.club.name : null, sports: x.sports || [], beginners_welcome: !!x.beginnersWelcome, weather: x.weather ? x.weather.text : null, weather_basis: x.weather ? x.weather.basis : null })) };
  const map = { kind: 'list', list: 'events', sport: runOnly ? 'run' : 'ride', title: `${what[0].toUpperCase() + what.slice(1)} near ${P.name}${when}`, subtitle: `${rows.length} soonest${wider ? `, within ${f.dist(km)}` : ''} · ${P.label}`,
    updated: W.updated, items: rows.map((x) => ({ name: x.name, photo: x.photo || null, app: x.app, sub: [`${longDay(x.start, x.tz)} ${hm(x.start, x.tz, f)}`, KIND_WORD[x.kind], x.club && x.club.name].filter(Boolean).join(' · '),
      line: [x.area && x.area.name ? `From ${x.area.name}` : '', distOf(x.km, f)].filter(Boolean).join(' · '), tags: x.beginnersWelcome ? ['Beginners welcome'] : [],
      next: x.weather ? x.weather.text : '', weather: x.weather ? x.weather.basis : null, url: x.url, button: { label: 'I\'m in', url: x.join || x.url } })),
    sponsor, units: f.system };
  return { text, structured: S, map };
}
