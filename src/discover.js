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
import { unitsFor } from './words.js';
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
      + 'Lists approved clubs and organisers on Windline (cycling) and RunFast (running) nearest first, with their weekly sessions, whether beginners are welcome, their pace groups, their next session with its weather, and a Join link to the club\'s page. '
      + 'Only clubs that have added their area show; never a person. Say what each club chose to share, and nothing more.',
    inputSchema: {
      type: 'object',
      properties: { place: PLACE_ARG, sport: SPORT_ARG, beginners: { type: 'boolean', description: 'true when the user wants a beginner-friendly club.' },
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
const placeMemo = new Map();
/** "Fourways" → { name, label, lat, lon, country } or null. Suburbs, towns and cities before shops and streets. */
export async function placeOf(q) {
  const key = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80); if (!key) return null;
  const hit = placeMemo.get(key); if (hit && Date.now() - hit.at < 864e5) return hit.p;
  const r = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(key)}&limit=8&lang=en`, 3500);
  const fs = (r.ok && r.body && r.body.features) || [];
  const all = fs.map((f) => { const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
    return { name: p.name || p.city || '', city: p.city || '', state: p.state || '', country: (p.countrycode || '').toUpperCase(), countryName: p.country || '', lat: +c[1], lon: +c[0], place: p.osm_key === 'place' || PLACE.has(p.osm_value) }; })
    .filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lon));
  const p = all.find((x) => x.place) || all[0] || null;
  const out = p ? { name: p.name, label: [p.name, p.city !== p.name ? p.city : '', p.countryName].filter(Boolean).join(', '), lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), country: p.country || null } : null;
  if (r.ok) { if (placeMemo.size > 500) placeMemo.clear(); placeMemo.set(key, { at: Date.now(), p: out }); }
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
export async function findClubs(ctx, args, sponsor) {
  const { R, now } = ctx, sport = SPORTS.includes(args.sport) ? args.sport : null, beginners = args.beginners === true;
  const P = await placeOf(args.place);
  if (!P) { const t = `I couldn't find "${String(args.place || '').slice(0, 60)}" on the map. Which suburb or town is it near?`; return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t }, map: null, miss: 'no_place' }; }
  const f = unitsFor(args.units, null, zoneAt([P.lat, P.lon]));
  let km = Math.min(100, Math.max(1, Math.round(+args.km || 25))), wider = false;
  const qs = (k) => `lat=${r3(P.lat)}&lon=${r3(P.lon)}&km=${k}${apiSport(sport) ? '&sport=' + apiSport(sport) : ''}${beginners ? '&beginners=true' : ''}`;
  let r = await near(R, 'clubs', appsFor(sport), qs(km));
  if (r.ok && !r.list.length && !args.km && km < 50) { km = 50; wider = true; r = await near(R, 'clubs', appsFor(sport), qs(km)); }
  const what = `${beginners ? 'beginner-friendly ' : ''}${sport && sport !== 'tours' ? SPORT_WORDS[sport] + ' ' : sport === 'tours' ? 'tour ' : ''}clubs`;
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
    const tags = [x.beginnersWelcome ? 'Beginners welcome' : '', x.paceGroups ? `pace groups ${x.paceGroups}` : ''].filter(Boolean).join('; '); if (tags) bits.push(tags[0].toUpperCase() + tags.slice(1) + '.');
    const nx = nextLine(x, f, true); if (nx) bits.push(nx + '.');
    bits.push(`Join: ${x.join || x.url}`);
    return bits.join(' ');
  });
  const more = r.list.length > rows.length ? `\n${r.list.length - rows.length} more further out.` : '';
  const W = credits(rows);
  const text = `${head}\n${lines.join('\n')}${more}${W.line}\nEach club's page shows what it chose to share. Join opens it, with sign-in or a free account in the same step.\n${addLine(sport)}\n\n${sponsor}`;
  const runOnly = rows.every((x) => x.app === 'runfast');
  const S = { view: 'clubs', place: P.label, km, sport, beginners, app: runOnly ? 'runfast' : 'windline', units: f.system, sponsor_line: sponsor, add_club: ADD_CLUB, basis: W.basis, forecast_updated: W.forecast_updated,
    clubs: rows.map((x) => ({ id: x.id, app: x.app, name: x.name, kind: x.kind, url: x.url, join: x.join || x.url, photo: x.photo || null, km: x.km, area: x.area ? x.area.name : null,
      sports: x.sports || [], sessions: x.sessionsLine || null, beginners_welcome: !!x.beginnersWelcome, pace_groups: x.paceGroups || null, who_for: x.whoFor || null,
      next: x.next ? { start: x.next.start, place: x.next.place || null, kind: x.next.kind, weather: x.weather ? x.weather.text : null, weather_basis: x.weather ? x.weather.basis : null } : null })) };
  const map = { kind: 'list', list: 'clubs', sport: runOnly ? 'run' : 'ride', title: `${what[0].toUpperCase() + what.slice(1)} near ${P.name}`, subtitle: `${rows.length} nearest${wider ? `, within ${f.dist(km)}` : ''} · ${P.label}`,
    items: rows.map((x) => ({ name: x.name, photo: x.photo || null, app: x.app, sub: [distOf(x.km, f), x.area && x.area.name, NAME[x.app]].filter(Boolean).join(' · '), line: x.sessionsLine || '',
      tags: [x.beginnersWelcome ? 'Beginners welcome' : '', x.paceGroups ? `Pace ${x.paceGroups}` : ''].filter(Boolean), next: nextLine(x, f, false), weather: x.weather ? x.weather.basis : null,
      url: x.url, button: { label: 'Join', url: x.join || x.url } })),
    updated: W.updated, add: { label: 'Is your club missing? Add it free', url: RUNNING.includes(sport) || sport === 'running' || runOnly ? ADD_CLUB.running : ADD_CLUB.cycling },
    sponsor, units: f.system };
  return { text, structured: S, map };
}

// ---------------------------------------------------------------- find_events
export async function findEvents(ctx, args, sponsor) {
  const { R, now } = ctx, sport = SPORTS.includes(args.sport) ? args.sport : null, kinds = KINDS[args.kind] || null;
  const P = await placeOf(args.place);
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
