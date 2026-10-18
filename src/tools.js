// The three tools. Every fact comes from the public reads (reads.js) and every weather number from the one engine (weather.js).
// Privacy (README, "For the auditor"): a position (a km, a mile, a dot, the weather there) is shared only when the public follow
// answer gives one (`last`) and the person is moving (live, delayed, no signal); paused, stopped, waiting, hidden near the start or
// finish, private or not shared: "I can't share where they are right now". Names as the public-name rule shows them ("Megan N.").
import { WL } from './gen/engine.js';
import { reads, SITE, SPORT, PERSON, NAME, DEMOS, isDemo, demoListed } from './reads.js';
import { unitsFor, hms, span, ago, clock, shortName, firstName } from './words.js';
import { findTour } from './eventweather.js';
import { coursePoints, weatherFor, colourOf, KEY, HARD_WORDS, HEAT_WORDS } from './weather.js';
import { placeHint } from './discover.js';

const MOVING = ['live', 'delayed', 'nosignal'];
const HANDLE = /^[a-z][a-z0-9-]{2,29}$/;
const fullName = (n) => String(n || '').replace(/\s+/g, ' ').trim(); // a Findable person's name as they set it
const STOP = new Set(['the', 'in', 'at', 'a', 'an', 'of', 'and', 'race', 'today', 'this', 'year', 'event', 'marathon', 'ultra', 'live']);
const YEAR = /^(19|20)\d\d$/; // "Comrades 2026": the year never decides the race
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
/** Every word typed is the start of a word in the text (livedot.me's search rule). */
export const hit = (text, q) => { const t = words(text), w = words(q).filter((x) => !STOP.has(x) && !YEAR.test(x)); return w.length > 0 && w.every((x) => t.some((y) => y.startsWith(x))); };
const cid = (id) => String(id || '').replace(/^run:/, 'run-'); // RunFast spells a club race 'run:<id>' in entries and 'run-<id>' in addresses

export const SPONSOR_FALLBACK = 'ProLend';
const sponsorLine = (name) => `Live tracking, proudly brought to you free thanks to ${name || SPONSOR_FALLBACK}.`;

// ---------------------------------------------------------------- one shape for both apps' Live
function norm(app, v) {
  const ev = app === 'windline' ? v.event : v.race, team = teamOf(v, ev);
  return {
    app, pid: v.pid, name: v.name || (app === 'windline' ? 'Rider' : 'Runner'), status: v.status || (v.live ? 'live' : null),
    km: typeof v.km === 'number' ? v.km : null, total: v.total || null, speed: v.speed, pace: v.pace, plan: v.plan || null, goal: v.goal || null,
    ghost: v.ghost || null, finish: v.finish || null, started: v.started || null, last: v.last || null, seen: v.seen || null,
    taps: v.taps && typeof v.taps.count === 'number' ? v.taps.count : 0, free: v.kind === 'free',
    tapsOn: !(v.taps && v.taps.on === false), tapsOpen: !!(v.taps && v.taps.open), findable: !!v.findable, photo: photoOf(app, v.photo),
    bib: v.bib != null ? String(v.bib) : null, club: v.club ? String(v.club.name || v.club) : team && team.club ? team.club.name : null, place: v.place || v.city || v.country || null, wave: v.wave || null, // only when an answer carries them
    event: ev ? { id: cid(ev.id), name: ev.name, tz: ev.tz || null, dayId: ev.day && ev.day.id, dayLabel: ev.day && ev.day.label } : null,
    team,
  };
}
/** Their club and coach line (Windline/RunFast `team`, coach-line contract 18 Oct): only the pages' public names, slugs, links and the
 *  club's logo; never on a private race, ride or run (the servers send null there; this holds it too). → { club, coach } or null. */
const PAGE_URL = /^https:\/\/(livedot\.me|windline\.tech|runfast\.tech)\//;
function teamOf(v, ev) {
  const t = v && v.team; if (!t || typeof t !== 'object') return null;
  if (v.private || (ev && (ev.private || ev.visibility === 'private')) || v.visibility === 'private') return null;
  const nm = (x) => x.name.replace(/\s*\(demo\)\s*$/i, '').trim().slice(0, 80); // "(demo)" only in an accessibility label, never in the line
  const part = (x) => (x && typeof x === 'object' && typeof x.name === 'string' && x.name.replace(/\(demo\)/i, '').trim() && /^[a-z0-9][a-z0-9-]{1,47}$/.test(String(x.slug || '')) ? x : null);
  const c = part(t.club), k = part(t.coach), url = (x) => (typeof x.url === 'string' && PAGE_URL.test(x.url) ? x.url : `${SITE.livedot}/${x.slug}`);
  const club = c ? { slug: c.slug, name: nm(c), logo: logoOf(c.logo), url: url(c) } : null;
  const coach = k ? { slug: k.slug, name: nm(k), url: url(k), ...(k.demo === true ? { demo: true } : {}) } : null;
  return club || coach ? { club, coach } : null;
}
/** The clause after their name in the text answer: " (ProLend Cycling Club, coached by Coach Nadia Pillay)"; never "(demo)". */
const withTeam = (name, t) => { const a = t ? [t.club && t.club.name, t.coach && 'coached by ' + t.coach.name].filter(Boolean).join(', ') : ''; return !a ? name : /\)$/.test(name) ? name.replace(/\)$/, '; ' + a + ')') : `${name} (${a})`; };
/** A person's photo, only from the apps' own hosts (windline.tech, runfast.tech; a path is on the app's own), else null. */
function photoOf(app, u) {
  if (!u || typeof u !== 'string') return null;
  try { const x = new URL(u, SITE[app]); return x.protocol === 'https:' && (x.hostname === 'windline.tech' || x.hostname === 'runfast.tech') ? x.href : null; } catch (e) { return null; }
}
/** How a person is shown: Findable (they chose to be found by name) by their full name and photo; anyone else by first name and
 *  initial, no photo (Wes, 17 Oct: "how am I going to know who Megan N. is?"). */
const named = (p) => !!(p && (p.found || p.findable));
const nameOf = (p) => (named(p) ? fullName(p.name) : shortName(p.name));
const photoFor = (p) => (named(p) ? p.photo || null : null);
const listOf = (body) => (body && (body.riders || body.runners)) || [];
const sharesPosition = (p) => MOVING.includes(p.status) && !!p.last && isFinite(p.last.lat) && isFinite(p.last.lon) && p.km != null;

// ---------------------------------------------------------------- links
const followUrl = (p, via) => {
  if (via && via.handle) return `${SITE.livedot}/${via.handle}`;
  if (via && via.code && via.code !== 'demo') return `${SITE[p.app]}/f/${via.code}`;
  if (via && via.code === 'demo') return `${SITE[p.app]}/live/race/${p.app === 'windline' ? 'coast-demo' : 'comrades-demo'}`;
  if (p.event) return p.app === 'windline' ? `${SITE.windline}/live/race/${encodeURIComponent(p.event.id)}?q=${encodeURIComponent(p.name)}&focus=${encodeURIComponent(p.pid)}` : `${SITE.runfast}/live/race/${encodeURIComponent(p.event.id)}?focus=${encodeURIComponent(p.pid)}`;
  return `${SITE[p.app]}/live?focus=${encodeURIComponent(p.pid)}`;
};
const idOf = (p, via) => (via && via.handle ? 'h:' + via.handle : via && via.code ? `${p.app}:f:${via.code}` : `${p.app}:p:${p.pid}`);

/** A link the user pasted → { handle } or { app, code }, else null. */
export function parseLink(s) {
  const t = String(s || '').trim(); let m;
  if ((m = t.match(/^(?:https?:\/\/)?(?:www\.)?livedot\.me\/@?([A-Za-z][A-Za-z0-9-]{2,29})\/?(?:[?#].*)?$/))) return { handle: m[1].toLowerCase() };
  if ((m = t.match(/^(?:https?:\/\/)?(?:www\.)?(windline|runfast)\.tech\/live\/h\/([A-Za-z][A-Za-z0-9-]{2,29})/i))) return { handle: m[2].toLowerCase() };
  if ((m = t.match(/^(?:https?:\/\/)?(?:www\.)?(windline|runfast)\.tech\/f\/([A-Za-z0-9]{4,16})/i))) return { app: m[1].toLowerCase(), code: m[2] };
  return null;
}

// ---------------------------------------------------------------- small caches (per isolate): the live list and the sponsor
const cache = new Map();
async function held(key, ms, fn) {
  const c = cache.get(key), now = Date.now(); if (c && now - c.at < ms) return c.p;
  const p = fn(); cache.set(key, { at: now, p }); p.catch(() => cache.delete(key)); return p;
}
async function sponsorName(R) { return held('sponsor', 10 * 6e4, async () => { const r = await R.sponsor(); return r.ok && r.body && r.body.sponsor && r.body.sponsor.name || SPONSOR_FALLBACK; }).catch(() => SPONSOR_FALLBACK); }
/** Every live race on both apps (GET /api/profile?live=1), held 30 s. */
async function liveRaces(R) {
  return held('live|' + R.H.windline + '|' + R.H.runfast, 30e3, async () => {
    const both = await Promise.all(['windline', 'runfast'].map((a) => R.profile(a, 'live=1&limit=100')));
    return both.flatMap((r, i) => (r.ok && r.body && Array.isArray(r.body.events) ? r.body.events.map((e) => ({ ...e, app: e.app || ['windline', 'runfast'][i] })) : []));
  });
}
async function upcomingRaces(R) {
  return held('upcoming|' + R.H.windline + '|' + R.H.runfast, 60e3, async () => {
    const both = await Promise.all(['windline', 'runfast'].map((a) => R.profile(a, 'upcoming=1&limit=200')));
    return both.flatMap((r, i) => (r.ok && r.body && Array.isArray(r.body.events) ? r.body.events.map((e) => ({ ...e, app: e.app || ['windline', 'runfast'][i] })) : []));
  });
}
const wantsDemo = (...s) => s.some((x) => /\bdemo\b/i.test(String(x || '')));
const demoRaces = (q) => { const w = words(q).filter((x) => x !== 'demo' && !STOP.has(x)); return DEMOS.filter((d) => !w.length || w.some((x) => d.words.some((y) => y.startsWith(x)))); };

// ---------------------------------------------------------------- the map payload (the widget draws it; never sent to the model)
function thin(pts, max) { if (pts.length <= max) return pts.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]); const out = [], k = (pts.length - 1) / (max - 1); for (let i = 0; i < max; i++) { const p = pts[Math.round(i * k)]; out.push([+p[0].toFixed(5), +p[1].toFixed(5)]); } return out; }
function stopsOf(w) {
  if (!w) return null; const by = {}; w.a.segs.forEach((g) => { by[g.s.id] = g; });
  const out = []; let last = null;
  w.lg.forEach((s) => { const g = by[s.id], c = g ? colourOf(g, w.sport) : '#8B85FF'; if (c !== last) { out.push([+(s.fromKm / w.R.total).toFixed(4), c]); last = c; } });
  return out;
}

// ---------------------------------------------------------------- where_is: one person's answer
async function personAnswer(ctx, p, via, extra = {}) {
  const { R, f0, now } = ctx, sport = p.app === 'runfast' ? 'run' : 'ride', doing = sport === 'run' ? 'running' : 'riding';
  let course = null, cbody = null;
  if (p.event && !p.free) { const c = await R.course(p.app, p.event.id); if (c.ok) { cbody = c.body; course = coursePoints(p.app, c.body, p.event.dayId); } }
  const tz = (p.event && p.event.tz) || (cbody && cbody.tz) || null, f = f0(tz), name = nameOf(p), first = firstName(p.name).replace(/^(.)/, (c) => c.toUpperCase());
  const race = p.event ? p.event.name.replace(/\s*\(demo\)\s*$/i, ' (demo)') : p.free ? (sport === 'run' ? 'a run of their own (Run live)' : 'a ride of their own (Ride live)') : null;
  const shared = sharesPosition(p), url = followUrl(p, via), sponsor = sponsorLine(await sponsorName(R));
  // a tap would go through (the apps' own rule, as their Live says it: taps on, and open while live or in the day after the finish),
  // and this asker may give one: Findable, or holding their link or handle (Wes, 17 Oct: never a button that fails)
  const canTap = !!(p.tapsOn && p.tapsOpen && (named(p) || (via && (via.code || via.handle))));
  const S = { view: 'person', id: idOf(p, via), name, photo: photoFor(p), app: p.app, sport: SPORT[p.app], status: p.status, race, team: p.team || null, follow_url: url, can_tap: canTap, units: f.system, sponsor_line: sponsor };
  const who = withTeam(name, p.team); // the first sentence names them with their club and coach, once
  const lines = [], stats = [];
  const total = p.total || (course && course.km) || null;
  let w = null;

  if (shared) {
    const kmNow = p.km, pct = total ? Math.min(1, kmNow / total) : null;
    S.position = { km: +kmNow.toFixed(2), mile: +(kmNow * 0.621371).toFixed(2), of_km: total, percent: pct == null ? null : Math.round(pct * 100), seen: new Date(p.last.t || p.seen || now).toISOString() };
    let s1 = `${who} is at ${f.at(kmNow)}` + (total ? ` of ${f.dist(total)}` : '') + (race ? ` in the ${race.replace(/^the /i, '')}` : '');
    if (p.goal && p.ghost && typeof p.ghost.diff === 'number') {
      const d = p.ghost.diff; S.goal = { goal: hms(p.goal), behind_s: Math.round(d) };
      s1 += Math.abs(d) < 30 ? `, right on goal pace (${hms(p.goal)})` : `, ${span(d)} ${d > 0 ? 'behind' : 'ahead of'} the goal (${hms(p.goal)})`;
      stats.push({ k: 'Goal', v: Math.abs(d) < 30 ? 'On pace' : (d > 0 ? '+' : '−') + hms(d), sub: hms(p.goal) + ' goal', tone: Math.abs(d) < 30 ? 'good' : d > 0 ? 'warn' : 'good' });
    }
    lines.push(s1 + '.');
    const kmh = p.app === 'runfast' ? (p.pace > 0 ? 3600 / p.pace : null) : p.speed > 0 ? p.speed : null;
    if (kmh) { S.pace = p.app === 'runfast' ? { per_km_s: Math.round(p.pace), words: f.pace(kmh) } : { kmh: Math.round(kmh), words: f.speed(kmh) }; lines.push(`${doing[0].toUpperCase() + doing.slice(1)} at ${p.app === 'runfast' ? f.pace(kmh) : f.speed(kmh)}` + (p.status === 'nosignal' ? `; last heard from ${ago(p.last.t || p.seen, now)}` : '') + '.'); stats.push({ k: p.app === 'runfast' ? 'Pace' : 'Speed', v: p.app === 'runfast' ? f.paceShort(kmh) : f.speedShort(kmh) }); }
    else if (p.status === 'nosignal') lines.push(`No signal for a while: last heard from ${ago(p.last.t || p.seen, now)}.`);

    // the weather there, from the one engine
    if (course) w = await weatherFor({ app: p.app, v: p, course, forecastUrl: R.H.forecast, now }).catch(() => null);
    if (w) {
      const x = w.x, ww = x.w, head = x.head, eff = x.effect;
      const wind = eff === 'head' ? `a ${f.speed(head)} headwind` : eff === 'tail' ? `a ${f.speed(-head)} tailwind` : eff === 'calm' ? `calm air at ${f.speed(ww.speed)}` : `a ${f.speed(ww.speed)} side-on wind`;
      S.conditions = { temp_c: Math.round(ww.temp), feels_c: x.feels == null ? null : Math.round(x.feels), wind_kmh: Math.round(ww.speed), gust_kmh: Math.round(ww.gust), wind_from_deg: Math.round(ww.from), along_road_kmh: Math.round(head), effect: eff, rain_mm_h: +(ww.precip || 0).toFixed(1) };
      let s2 = `Where ${first} is: ${f.deg(ww.temp)}, ${wind}`;
      if (sport === 'run') {
        S.conditions.heat_stress = x.heat || null; S.conditions.wbgt_c = x.wbgt == null ? null : Math.round(x.wbgt); S.conditions.rating = x.hard || null;
        if (x.hard) s2 += `, rated ${HARD_WORDS[x.hard]}`;
        if (x.heat && x.heat !== 'low') s2 += ` (heat stress ${HEAT_WORDS[x.heat]})`;
      } else if (x.feels != null && Math.abs(x.feels - ww.temp) >= 3) s2 += `, feels like ${f.deg(x.feels)} at riding speed`;
      lines.push(s2 + '.');
      stats.push({ k: 'There now', v: f.degShort(ww.temp) + ' · ' + (eff === 'head' ? 'Headwind ' + f.speedShort(head) : eff === 'tail' ? 'Tailwind ' + f.speedShort(-head) : eff === 'calm' ? 'Calm' : 'Side-on ' + f.speedShort(ww.speed)), sub: sport === 'run' && x.hard ? 'Rated ' + HARD_WORDS[x.hard] : null, tone: sport === 'run' ? ({ ideal: 'good', slower: 'mid', hard: 'warn', veryhard: 'bad' })[x.hard] : eff === 'head' && head >= 15 ? 'bad' : eff === 'head' ? 'warn' : eff === 'tail' ? 'good' : null });
      S.ahead = w.ahead.slice(0, 4).map((g) => ({ from_km: +g.s.fromKm.toFixed(1), to_km: +g.s.toKm.toFixed(1), at: g.eta.toISOString(), temp_c: Math.round(g.w.temp), effect: g.effect, along_road_kmh: Math.round(g.head), wind_kmh: Math.round(g.w.speed), ...(sport === 'run' ? { heat_stress: g.heat || null, rating: g.hard || null } : {}) }));
      if (w.verdict) {
        const v = WL.verdictOf(w.verdict.a, 'apple', f.U), stretch = `${f.atShort(w.verdict.fromKm)}–${f.num(w.verdict.toKm)}`;
        S.road_ahead = { from_km: +w.verdict.fromKm.toFixed(1), to_km: +w.verdict.toKm.toFixed(1), rating: v.rating, why: v.why || null, plus: v.plus || null };
        lines.push(`The road ahead (${stretch}) rates ${WL.RATE[v.rating]}` + (v.why ? `: ${v.why}` : v.plus ? `: ${v.plus}` : '') + '.');
      }
      if (w.fetched) S.forecast_updated = new Date(w.fetched).toISOString();
    }
  } else if (p.status === 'finished') {
    const t = p.finish && p.started ? p.finish - p.started : null;
    lines.push(`${who} has finished` + (race ? ` the ${race.replace(/^the /i, '')}` : '') + (t ? ` in ${hms(t / 1000)}` : '') + (p.goal && t ? (t / 1000 <= p.goal ? `, inside the ${hms(p.goal)} goal` : `, against a ${hms(p.goal)} goal`) : '') + '.');
    S.finished = { time: t ? hms(t / 1000) : null, at: p.finish ? new Date(p.finish).toISOString() : null };
  } else if (p.status === 'waiting') {
    const st = p.plan && p.plan.start ? Date.parse(p.plan.start) : cbody && cbody.start ? Date.parse(cbody.start) : null;
    lines.push(`${who} hasn't started yet` + (race ? ` in the ${race.replace(/^the /i, '')}` : '') + (st && st > now ? `; the start is at ${clock(st, tz, f)} race time` : '') + '.');
  } else if (p.status === 'stopped') {
    lines.push(`${who} stopped before the finish` + (race ? ` of the ${race.replace(/^the /i, '')}` : '') + ', so I can\'t share where they are.');
  } else {
    lines.push(`${who} is ${p.status === 'paused' ? 'paused' : 'out on the course'}` + (race ? ` in the ${race.replace(/^the /i, '')}` : '') + ', but I can\'t share where they are right now' + (p.status === 'paused' ? '' : ' (the live page hides positions near the start and finish)') + '.');
  }

  // the finish: the server's own projection (start + goal + time against it, or the plan's pace), in the race's clock
  if (shared && p.finish && p.finish > now) {
    S.eta = { at: new Date(p.finish).toISOString(), local: clock(p.finish, tz, f), tz };
    lines.push(`At this pace ${first} finishes around ${clock(p.finish, tz, f)}` + (tz ? ' race time' : ' UTC') + '.');
    stats.push({ k: 'Finish', v: clock(p.finish, tz, f), sub: 'race time' });
  }
  if (extra.note) lines.push(extra.note);
  lines.push(`Follow live: ${url}`);
  const text = lines.join(' ').replace(/ Follow live:/, '\nFollow live:') + '\n\n' + sponsor;

  // the widget's picture
  const pts = course ? course.pts : [];
  const map = {
    kind: 'person', sport, app: p.app, name, race, status: p.status, statusWord: ({ live: 'Live', delayed: 'Live', nosignal: 'No signal', paused: 'Paused', waiting: 'Not started', finished: 'Finished', stopped: 'Stopped' })[p.status] || 'Live',
    course: pts.length ? thin(pts, 600) : [], progress: shared && w ? Math.min(1, w.km / w.R.total) : shared && total ? Math.min(1, p.km / total) : p.status === 'finished' ? 1 : 0,
    dot: shared ? { lat: p.last.lat, lon: p.last.lon, label: firstName(p.name) + ' · ' + f.atShort(p.km) } : null,
    ghost: shared && p.goal && p.ghost && p.ghost.lat != null ? { lat: p.ghost.lat, lon: p.ghost.lon } : null,
    stops: stopsOf(w), key: w ? KEY[sport] : null, keyTitle: sport === 'run' ? 'How hard the weather makes it' : 'The wind on the road',
    headline: shared ? f.atShort(p.km) + (total ? ' of ' + f.num(total) + ' ' + f.label.dist : '') : null,
    stats, ahead: (S.ahead ? w.ahead.slice(0, 4).map((g) => ({ k: f.atShort(g.s.fromKm) + '–' + f.num(g.s.toKm), v: (g.effect === 'head' ? 'Headwind ' + f.speedShort(g.head) : g.effect === 'tail' ? 'Tailwind ' + f.speedShort(-g.head) : g.effect === 'calm' ? 'Calm' : 'Side-on ' + f.speedShort(g.w.speed)), sub: f.degShort(g.w.temp) + (sport === 'run' && g.heat && g.heat !== 'low' ? ' · Heat ' + HEAT_WORDS[g.heat] : ''), c: colourOf(g, sport), at: clock(g.eta.getTime(), tz, f) })) : []),
    follow: { url, label: via && via.handle ? 'Follow live' : 'Watch live' }, handle: via && via.handle || null, photo: S.photo, team: S.team,
    refresh: { tool: 'where_is', args: { person: S.id, units: f.system } }, // the card keeps itself up to date (widget: every 30 s while it's on screen)
    tap: canTap ? { person: S.id, first, finished: p.status === 'finished', label: p.status === 'finished' ? `Congratulate ${first}` : `Give ${first} a tap on the back` } : null,
    updated: [shared ? 'Position ' + ago(p.last.t || p.seen || now, now) : null, w && w.fetched ? 'Forecast ' + ago(w.fetched, now) : null, w ? 'Apple Weather' : null].filter(Boolean).join(' · '),
    sponsor, units: f.system,
  };
  return { text, structured: S, map };
}

/** Resolve a person from a handle, a code or a find_person id → { p, via } or { text } (why not). */
async function resolve(ctx, args) {
  const { R } = ctx;
  let handle = args.handle ? String(args.handle).trim().replace(/^@/, '') : null, code = args.code ? String(args.code).trim() : null, app = null;
  for (const s of [args.link, handle, code]) { const L = s && parseLink(s); if (L) { if (L.handle) { handle = L.handle; code = null; } else { app = L.app; code = L.code; handle = null; } break; } }
  if (args.person) {
    const m = String(args.person).match(/^(?:(windline|runfast):(p|f):([A-Za-z0-9_-]{2,64})|h:([a-z][a-z0-9-]{2,29}))$/);
    if (!m) return { text: 'That person id isn\'t one find_person gave. Call find_person first.' };
    if (m[4]) handle = m[4];
    else if (m[2] === 'f') { app = m[1]; code = m[3]; }
    else {
      const r = await R.liveByPid(m[1], [m[3]]), v = listOf(r.body)[0];
      if (!v) return { text: 'They aren\'t findable on a live race right now (they may have finished, stopped sharing or chosen not to be findable).' };
      return { p: { ...norm(m[1], v), found: true }, via: null }; // an id from find_person: someone found by name (Findable)
    }
  }
  if (handle) {
    handle = handle.toLowerCase();
    if (!HANDLE.test(handle)) return { text: `"${handle}" isn't a livedot handle.` };
    const h = await R.handle(handle);
    if (!h.ok) return { text: 'livedot didn\'t answer just now. Try again in a moment.' };
    const b = h.body || {};
    if (!b.handle) return { text: `There's no one at livedot.me/${handle}.` };
    const nm = (b.person && b.person.name) || handle;
    const running = (b.live || []).filter((x) => ['live', 'paused', 'delayed', 'nosignal', 'waiting'].includes(x.status));
    if (!running.length) {
      const up = (b.upcoming || [])[0];
      return { text: `${nm} isn't live right now (no race, ride or run on the go)` + (up ? `. Next: ${up.name}${up.date ? ' on ' + up.date : ''}` : '') + `. Their livedot page: ${SITE.livedot}/${b.handle}` };
    }
    for (const x of running) {
      const r = await R.liveByHandle(x.app, b.handle), v = listOf(r.body)[0];
      if (v) return { p: norm(x.app, v), via: { handle: b.handle } };
    }
    return { text: `${nm} is racing, but I can't share where they are right now. Their livedot page: ${SITE.livedot}/${b.handle}` };
  }
  if (code) {
    if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return { text: 'That isn\'t a follow link.' };
    for (const a of app ? [app] : ['windline', 'runfast']) {
      const r = await R.liveByCode(a, code), v = listOf(r.body)[0];
      if (v) return { p: norm(a, v), via: { code } };
    }
    return { text: 'That follow link has been reset or isn\'t live. Ask them for a new one.' };
  }
  return { text: 'Tell me who: a livedot handle, a follow link, or call find_person with their name first.' };
}

export async function whereIs(ctx, args) {
  const r = await resolve(ctx, args);
  if (!r.p) return { text: r.text + '\n\n' + sponsorLine(await sponsorName(ctx.R)), structured: { view: 'none', message: r.text }, map: null };
  return personAnswer(ctx, r.p, r.via);
}

// ---------------------------------------------------------------- tap_on_the_back (Wes, 17 Oct: "millions of people asking ChatGPT where
// their loved one is, and giving them a tap on the back"). The tap goes through the apps' own tap (Windline's /api/mcp/tap, livedot.me's
// server only: riders.js or RunFast's live.js), so every rule of the follow page holds: only while they're live or in the day after the
// finish (a congratulation), never if they turned taps off, one a minute from the same asker, the same caps.
const firstOf = (n) => String(n || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || 'They';
export async function tapOnTheBack(ctx, args) {
  const { R } = ctx, sponsor = sponsorLine(await sponsorName(R));
  const tapAt = async (app, target) => {
    let res; try { res = await fetch(`${R.H.mcp}/tap`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ctx.proxy || {}), ...(ctx.authorization ? { Authorization: ctx.authorization } : {}) },
      body: JSON.stringify({ app, ...target, name: args.name ? String(args.name).slice(0, 40) : undefined, asker: ctx.asker || undefined }), signal: AbortSignal.timeout(15000) }); } catch (e) { return { status: 502, body: {} }; }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  if (args.tour) { // a tap for a TOUR goes to its organiser (Windline's tapTourAs): found as tour_route finds it
    const t = await findTour(R, String(args.tour).trim()), ev = t && t.ev;
    if (!ev) { const m = t && t.list ? `Several tours match "${args.tour}": ${t.list.join('; ')}. Ask the user which one.` : `I couldn't find a published Windline tour called "${args.tour}".`; return { text: `${m}\n\n${sponsor}`, structured: { view: 'none', message: m }, map: null }; }
    const o = await tapAt('windline', { tour: ev.slug });
    if (o.status !== 200 || !o.body.ok) { const m = (o.status === 429 && /another in a minute/.test(String(o.body && o.body.error))) ? `You gave ${ev.name} a tap a moment ago: you can give another in a minute.` : String((o.body && o.body.error) || 'The tap didn’t go through just now. Try again in a moment.'); return { text: `${m}\n\n${sponsor}`, structured: { view: 'none', message: m }, map: null }; }
    const who = o.body.organiser || 'The organiser', line = `Tap sent. ${who} will read it out tonight.` + (o.body.demo ? ' (This is the demo of a tour\'s taps: nothing is kept.)' : '');
    return { text: `${line}${o.body.named ? '' : ' (No name on it: connect your Windline or RunFast account, or tell me your first name, so they know who it was.)'}\n\n${sponsor}`, structured: { view: 'tap', sent: true, finished: false, named: !!o.body.named, demo: !!o.body.demo, tour: ev.name, taps: o.body.count || null, sponsor_line: sponsor }, map: null };
  }
  if (args.club || args.coach) return tapTeam(ctx, { club: args.club, coach: args.coach, event: args.event }, tapAt, sponsor); // the whole team: one tap to each member on the map
  const r = await resolve(ctx, args);
  let p = r.p, via = r.via, out;
  if (p) out = await tapAt(p.app, { pid: p.pid, code: via && via.code ? via.code : undefined, handle: via && via.handle ? via.handle : undefined });
  else if (args.handle || /^h:/.test(String(args.person || ''))) { // a finish in the last day: not "racing" any more, but a tap is a congratulation
    const handle = String(args.handle || String(args.person).slice(2)).trim().replace(/^@/, '').replace(/^https?:\/\/livedot\.me\//, '').toLowerCase();
    for (const app of ['runfast', 'windline']) { out = await tapAt(app, { handle }); if (out.status === 200) break; }
  }
  if (!out) return { text: `${r.text}\n\n${sponsor}`, structured: { view: 'none', message: r.text }, map: null };
  const who = p ? firstOf(p.name) : (out.body && out.body.first) || 'They';
  if (out.status !== 200 || !out.body.ok) {
    const e = String((out.body && out.body.error) || ''), why = out.status === 429 && /another in a minute/.test(e) ? `You gave ${who} a tap a moment ago: you can give another in a minute.`
      : out.status === 429 ? 'Lots of taps are going out from here just now. Try again in a minute.'
        : /turned taps on the back off/.test(e) ? `${who} has taps on the back turned off, so I can't send one.`
          : /Follow them first/.test(e) ? `${who} only gets taps from people who follow them or have their live link. Ask for their link (livedot.me/<handle> or a follow link), then try again.`
            : /more than a day ago/.test(e) ? `${who} finished more than a day ago, so taps on the back have closed.`
              : out.status === 404 ? `${who} isn't live just now, so a tap can't reach them.` : 'The tap didn\'t go through just now. Try again in a moment.';
    return { text: `${why}\n\n${sponsor}`, structured: { view: 'none', message: why, error: e || null }, map: null };
  }
  const done = !!out.body.finished, line = out.body.demo ? `Tap sent. ${who} (the demo ${(p && p.app) === 'windline' ? 'rider' : 'runner'}) feels it in the demo; nothing is kept.` : done ? `Tap sent. ${who} finished, so it lands as a congratulation on their phone.` : `Tap sent. ${who} will feel it on their phone.`;
  if (!p) return { text: `${line}\n\n${sponsor}`, structured: { view: 'tap', sent: true, finished: done, named: !!out.body.named, sponsor_line: sponsor }, map: null };
  const ans = await personAnswer(ctx, p, via);
  return { text: `${line}${out.body.named ? '' : ' (No name on it: connect your Windline or RunFast account, or tell me your first name, so they see who it was.)'}\n\n${ans.text}`,
    structured: { ...ans.structured, view: 'tap', sent: true, finished: done, named: !!out.body.named, taps: out.body.count || null }, map: ans.map };
}

// ---------------------------------------------------------------- find_person
function closeness(p, q) {
  const n = words(String(p.name).replace(/\(demo\)/i, '')).join(' '), w = words(q).join(' ');
  if (!w) return 0; if (n === w) return 3; if (n.startsWith(w)) return 2; return hit(p.name, q) ? 1 : 0;
}
function narrowBy(list, a) {
  const notes = []; let out = list;
  if (a.surname) out = out.filter((p) => { const w = words(p.name), s = words(a.surname)[0] || ''; return w.length > 1 && w.slice(1).some((x) => x.startsWith(s)); });
  for (const [k, label] of [['bib', 'bib numbers'], ['club', 'clubs'], ['place', 'home towns or countries'], ['wave', 'start waves']]) {
    if (!a[k]) continue;
    if (!out.some((p) => p[k])) { notes.push(`The public live pages don't show ${label}, so I can't narrow by ${k === 'bib' ? 'bib' : k}; ask for a surname or initial instead.`); continue; }
    out = out.filter((p) => p[k] && words(p[k]).join(' ').includes(words(a[k]).join(' ')));
  }
  return { out, notes };
}
const rank = (q) => (a, b) => (MOVING.includes(b.status) - MOVING.includes(a.status)) || (!!b.owner - !!a.owner) || (closeness(b, q) - closeness(a, q)) || (b.taps - a.taps) || (b.km || 0) - (a.km || 0) || a.name.localeCompare(b.name);

export async function findPerson(ctx, args) {
  const { R, f0, now } = ctx, raw = String(args.name_or_handle || '').trim(), event = String(args.event || '').trim();
  const sponsor = sponsorLine(await sponsorName(R));
  if (!raw) return { text: 'Who are you looking for? A name or a livedot handle.\n\n' + sponsor, structured: { view: 'none' }, map: null };
  const link = parseLink(raw); if (link) return whereIs(ctx, { link: raw, units: args.units });
  // a coach's people ("Coach Nadia's runners in the Comrades"): their team card, or which coach / which race (coach-line, 18 Oct)
  if (isCoachAsk(raw)) { const c = await clubInRace(ctx, { coach: raw, event, units: args.units }); if (c.structured && ['club', 'picker'].includes(c.structured.view)) return c; }
  // a club or team ("the UCT team", "Coast Riders", windline.tech/c/…): its people in the race, as club_in_race (Wes, 17 Oct)
  if (parseClub(raw) || CLUBISH.test(raw) || /\bdemo club\b/i.test(raw)) { const c = await clubInRace(ctx, { club: raw, event, units: args.units }); if (c.structured && ['club', 'picker'].includes(c.structured.view)) return c; }
  const q = raw.replace(/^@/, ''), qh = q.toLowerCase();

  // 1. a livedot handle. Typed as one ("@megan", "livedot.me/megan", "megan-n", or all lower case): an exact hit answers at once.
  // A plain name that is also someone's handle ("Megan") searches by name, with the handle's owner ranked first.
  let handleHit = null, handleLive = null;
  const asHandle = /^@/.test(raw) || /[-0-9]/.test(q) || q === qh;
  if (HANDLE.test(qh) && !wantsDemo(q)) {
    const h = await R.handle(qh);
    if (h.ok && h.body && h.body.handle) {
      const b = h.body, liveIn = (b.live || []).filter((x) => ['live', 'paused', 'delayed', 'nosignal', 'waiting'].includes(x.status));
      if (!event || liveIn.some((x) => hit(x.race, event)) || !liveIn.length) {
        if (asHandle) handleHit = b;
        else for (const x of liveIn) { const r = await R.liveByHandle(x.app, b.handle), v = listOf(r.body)[0]; if (v) { handleLive = { ...norm(x.app, v), via: { handle: b.handle }, owner: true }; break; } }
      }
    }
  }

  // 2. names, searched on the servers (never a whole field pulled in): the race's own search when the event is live, else each app's
  let people = [], scope = null, capped = false; const down = new Set(); // apps whose search didn't answer (timeout, 5xx, no connection)
  const failed = (app, r) => { if (!r.ok && (r.status === 0 || r.status >= 500)) down.add(app); };
  const letters = q.replace(/[^A-Za-z]/g, '').length, demo = wantsDemo(q, event);
  if (demo) {
    for (const d of demoRaces(event || q)) { const r = await R.liveByCode(d.app, 'demo'), v = listOf(r.body)[0]; if (v) people.push({ ...norm(d.app, v), via: { code: 'demo' } }); }
    scope = 'the demo races';
  } else if (letters >= 3) {
    const races = event ? (await liveRaces(R)).filter((e) => hit(e.name + ' ' + ((e.organiser && e.organiser.name) || ''), event)).slice(0, 4) : [];
    if (races.length) {
      scope = races.map((e) => e.name).join(' and ');
      const got = await Promise.all(races.map((e) => R.raceMap(e.app, e.id, q)));
      got.forEach((r, i) => { failed(races[i].app, r); const L = listOf(r.body); if (L.length >= 20) capped = true; L.forEach((v) => people.push(norm(races[i].app, v))); });
    } else {
      const got = await Promise.all(['windline', 'runfast'].map((a) => R.find(a, q)));
      for (let i = 0; i < 2; i++) {
        const a = ['windline', 'runfast'][i], L = listOf(got[i].body); failed(a, got[i]); if (L.length >= 20) capped = true; // the apps list their demo people only while config/demo.listed is on (App Review), then never
        if (a === 'runfast' && L.length) { const full = await R.liveByPid(a, L.map((v) => v.pid).slice(0, 20)); const F = listOf(full.body); L.forEach((v) => { const x = F.find((y) => y.pid === v.pid); people.push(norm(a, x || { ...v, status: v.live ? 'live' : null })); }); }
        else L.forEach((v) => people.push(norm(a, v)));
      }
      if (event) people = people.filter((p) => p.event && hit(p.event.name, event));
      scope = event || null;
    }
  }
  people.forEach((p) => { p.found = true; }); // found by name = they chose Findable: shown by their full name (Wes, 17 Oct: "how am I going to know who Megan N. is?")
  if (handleLive) { handleLive.found = people.some((x) => x.app === handleLive.app && x.pid === handleLive.pid); people.unshift(handleLive); } // the handle's owner, also found by name: Findable, so by their full name
  people = people.filter((p, i, all) => all.findIndex((x) => x.app === p.app && x.pid === p.pid) === i);
  const narrowed = narrowBy(people, args); people = narrowed.out;
  if (handleHit) people = people.filter((p) => !(handleHit.person && shortName(p.name) === handleHit.person.name && p.event && (handleHit.live || []).some((x) => x.race === p.event.name)));
  people.sort(rank(q));

  if (handleHit) {
    const r = await resolve(ctx, { handle: handleHit.handle });
    const others = people.length ? `If ${firstName(handleHit.person && handleHit.person.name || q)} isn't who you mean, tell me a surname: ${people.length}${capped ? '+' : ''} other ${people.length === 1 ? 'person matches' : 'people match'} "${q}".` : null;
    if (r.p) return personAnswer(ctx, r.p, r.via, { note: others });
    return { text: r.text + '\n\n' + sponsor, structured: { view: 'none', message: r.text }, map: null };
  }
  const nameExact = people.filter((p) => closeness(p, q) === 3);
  if (people.length === 1 || (nameExact.length === 1 && words(q).length >= 2)) { const p = people.length === 1 ? people[0] : nameExact[0]; return personAnswer(ctx, p, p.via || null); }

  if (!people.length && down.size) { // never "couldn't find anyone" when a server didn't answer: say so, and to try again
    const t = `livedot couldn't reach ${[...down].map((a) => NAME[a]).join(' or ')} just now, so I can't say whether ${firstName(q).replace(/^(.)/, (c) => c.toUpperCase())} is racing. Try again in a moment.`;
    return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t, upstream_error: [...down] }, map: null };
  }
  if (!people.length && letters >= 2) { const c = await clubInRace(ctx, { club: raw, event, units: args.units }); if (c.structured && c.structured.view === 'club') return c; } // no one by that name: a club of that name?
  if (!people.length) {
    const why = letters < 3 && !demo ? 'Give me at least three letters of their name, or their livedot handle.' : `I couldn't find anyone called "${q}"${scope ? ' in ' + scope : event ? ` in "${event}" (it may not be live right now)` : ''} who is findable on a live race. Only people who chose to be findable show up in search; otherwise ask them for their livedot link (livedot.me/<handle>).`;
    const t = [why, ...narrowed.notes].join(' ');
    return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t }, map: null };
  }
  // several: the top five for the model and the total; the widget gets the page (up to 20) as a picker
  const total = people.length, label = `${total}${capped ? '+' : ''}`, top = people.slice(0, 5);
  const row = (p) => {
    const f = f0(p.event && p.event.tz), sh = sharesPosition(p);
    return { id: idOf(p, p.via), name: nameOf(p).replace(/\s*\(demo\)\s*$/i, ''), photo: photoFor(p), sport: SPORT[p.app], race: p.event ? p.event.name : null, status: p.status,
      km_now: sh ? +p.km.toFixed(1) : null, where: sh ? f.atShort(p.km) : p.status === 'finished' ? 'Finished' : p.status === 'waiting' ? 'Not started' : null,
      goal: p.goal && p.ghost && typeof p.ghost.diff === 'number' && sh ? (Math.abs(p.ghost.diff) < 30 ? 'on goal pace' : `${span(p.ghost.diff).replace(/ minutes?$/, ' min')} ${p.ghost.diff > 0 ? 'behind' : 'ahead of'} goal`) : null,
      pace: sh ? (p.app === 'runfast' ? (p.pace > 0 ? f.paceShort(3600 / p.pace) : null) : (p.speed > 0 ? f.speedShort(p.speed) : null)) : null,
      seen: p.last && p.last.t ? ago(p.last.t, now) : p.seen ? ago(p.seen, now) : null, bib: p.bib, club: p.club, team: p.team || null };
  };
  const rows = people.slice(0, 20).map(row), first5 = rows.slice(0, 5);
  // never two rows that look the same: the second line carries what tells them apart (where, pace, the goal; then when last seen)
  const look = (r) => [r.name, r.where, r.pace, r.goal, r.handle].join('|'), n = {}; rows.forEach((r) => { r.handle = /^h:/.test(r.id) ? r.id.slice(2) : null; n[look(r)] = (n[look(r)] || 0) + 1; });
  rows.forEach((r) => { if (n[look(r)] > 1 && r.seen) r.extra = 'seen ' + r.seen; });
  const who = firstName(q) && words(q).length === 1 ? `${firstName(q).replace(/^(.)/, (c) => c.toUpperCase())}s` : `people matching "${q}"`;
  const head = `I found ${label} ${who}${scope ? ' in the ' + scope.replace(/^the /i, '') : ''}. Here are the 5 most likely:`;
  const list = first5.map((r, i) => `${i + 1}. ${r.name}${r.handle ? ' (livedot.me/' + r.handle + ')' : ''}${r.race && !scope ? ' (' + r.race + ')' : ''}${r.where ? ', ' + r.where : ''}${r.pace ? ', ' + r.pace : ''}${r.goal ? ', ' + r.goal : ''}${r.status && !MOVING.includes(r.status) ? '' : ''} [person: ${r.id}]`).join('\n');
  const ask = 'Ask the user ONE short question (surname or initial, bib or club) and call find_person again; or, once they pick, call where_is with that person id. Never guess.';
  const text = `${head}\n${list}\n\n${ask}${narrowed.notes.length ? ' ' + narrowed.notes.join(' ') : ''}\n\n${sponsor}`;
  const map = { kind: 'picker', title: `${label} ${who}`, subtitle: scope ? 'in the ' + scope.replace(/^the /i, '') : 'live on livedot', query: q, event: event || null, rows, total: label, sponsor, units: f0(null).system };
  return { text, structured: { view: 'picker', total: label, capped, people: first5, sponsor_line: sponsor }, map };
}

// ---------------------------------------------------------------- event_status
export async function eventStatus(ctx, args) {
  const { R, f0, now } = ctx, q = String(args.event || '').trim(), sponsor = sponsorLine(await sponsorName(R));
  if (args.coach) return clubInRace(ctx, { coach: args.coach, event: q, units: args.units }); // "How are Coach Nadia's runners doing in the Comrades?"
  if (args.club) return clubInRace(ctx, { club: args.club, event: q, units: args.units }); // "How's the UCT team doing in the Comrades?"
  if (!q) return { text: 'Which race?\n\n' + sponsor, structured: { view: 'none' }, map: null };
  let list = [];
  if (wantsDemo(q)) list = demoRaces(q).map((d) => ({ app: d.app, id: d.id, name: d.name, demo: true }));
  else {
    list = (await liveRaces(R)).filter((e) => hit(e.name + ' ' + ((e.organiser && e.organiser.name) || ''), q));
    // while an app lists its demo (config/demo.listed), its demo race is a live race like any other: "How's the Comrades going?" (a real
    // race of that name live now comes first: the demo answers whenever none is)
    if (!list.length) for (const d of DEMOS) if (hit(d.name, q) && (await demoListed(R, d.app))) list.push({ app: d.app, id: d.id, name: d.name, demo: true });
  }
  if (!list.length) {
    const up = wantsDemo(q) ? [] : (await upcomingRaces(R)).filter((e) => hit(e.name + ' ' + ((e.organiser && e.organiser.name) || ''), q)).slice(0, 3);
    const t = up.length
      ? `${q} isn't live right now. Coming up: ` + up.map((e) => `${e.name}${e.organiser ? ' (' + e.organiser.name + ')' : ''}, ${e.start ? new Date(e.start).toISOString().slice(0, 10) : ''}`).join('; ') + '.'
      : `No live race on livedot matches "${q}" right now. A race shows as live once someone findable on it is sending their position. Try the demo: "How's the Comrades demo going?"`;
    return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t, upcoming: up.map((e) => ({ name: e.name, start: e.start, url: e.url })) }, map: null };
  }
  if (list.length > 1 && !list.every((e) => e.demo)) {
    const t = `${list.length} live races match "${q}": ` + list.slice(0, 5).map((e, i) => `${i + 1}. ${e.name}${e.organiser ? ' (' + e.organiser.name + ')' : ''}, ${e.people} on the course`).join('; ') + '. Ask the user which one, then call event_status with its full name.';
    return { text: t + '\n\n' + sponsor, structured: { view: 'none', races: list.slice(0, 5).map((e) => ({ name: e.name, app: e.app, people: e.people })) }, map: null };
  }
  const e = list[0], app = e.app;
  const [m, c] = await Promise.all([R.raceMap(app, e.id), R.course(app, e.id)]);
  const L = listOf(m.body).map((v) => norm(app, v)), cb = c.ok ? c.body : null, tz = (cb && cb.tz) || e.tz || (L[0] && L[0].event && L[0].event.tz) || null, f = f0(tz);
  const course = cb ? coursePoints(app, cb, L[0] && L[0].event && L[0].event.dayId) : null;
  const count = m.body && typeof m.body.count === 'number' ? m.body.count : e.people != null ? e.people : L.length;
  const fin = L.filter((p) => p.status === 'finished').sort((a, b) => (a.finish || 0) - (b.finish || 0));
  const out = L.filter((p) => MOVING.includes(p.status)).sort((a, b) => (b.km || 0) - (a.km || 0));
  const started = e.started || (L.length ? Math.min(...L.map((p) => p.started || Infinity)) : null), total = (out[0] && out[0].total) || (cb && cb.km) || (e.leader && e.leader.total);
  const leaders = [...fin.slice(0, 3).map((p) => ({ name: nameOf(p), photo: photoFor(p), finished: hms(((p.finish || 0) - (p.started || 0)) / 1000) })), ...out.slice(0, 5 - Math.min(3, fin.length)).map((p) => (sharesPosition(p) ? { name: nameOf(p), photo: photoFor(p), km: +p.km.toFixed(1), where: f.atShort(p.km) } : { name: nameOf(p), photo: photoFor(p), km: null, where: 'on the course' }))]; // a km only where the public answer gives a position (KPMG C2: never near the start or finish, never stopped)
  const nm = e.name, lines = [];
  lines.push(`${nm} is live` + (started && isFinite(started) ? `: under way for ${span((now - started) / 1000)} (it's ${clock(now, tz, f)} there)` : '') + '.');
  lines.push(`${count} ${count === 1 ? PERSON[app] : PERSON[app] + 's'} on livedot's map${fin.length ? `, ${fin.length} finished` : ''}.`);
  if (out[0]) lines.push(sharesPosition(out[0]) ? `Out front: ${nameOf(out[0])} at ${f.at(out[0].km)}${total ? ' of ' + f.dist(total) : ''}.` : `Out front: ${nameOf(out[0])}, on the course.`);
  if (leaders.length) lines.push('Leaders on the public map: ' + leaders.map((x) => x.name + (x.finished ? ' (finished, ' + x.finished + ')' : ' (' + x.where + ')')).join(', ') + '.');
  const url = app === 'windline' ? `${SITE.windline}/live/race/${encodeURIComponent(e.id)}` : `${SITE.runfast}/live/race/${encodeURIComponent(e.id)}`;
  lines.push(`\nWatch the race live: ${url}`);
  const text = lines.join(' ') + '\n\n' + sponsor;
  const S = { view: 'event', name: nm, app, sport: SPORT[app], started: started && isFinite(started) ? new Date(started).toISOString() : null, on_map: count, finished: fin.length, leaders, url, units: f.system, sponsor_line: sponsor };
  const map = { kind: 'event', sport: app === 'runfast' ? 'run' : 'ride', app, name: nm, race: nm, status: 'live', statusWord: 'Live', course: course ? thin(course.pts, 600) : [], progress: 0,
    dots: out.slice(0, 60).filter(sharesPosition).map((p, i) => ({ lat: p.last.lat, lon: p.last.lon, lead: i === 0 })),
    headline: count + ' ' + (count === 1 ? PERSON[app] : PERSON[app] + 's') + ' on the map',
    stats: [{ k: 'Under way', v: started && isFinite(started) ? hms((now - started) / 1000).replace(/:\d\d$/, '') : '–', sub: 'h:min' }, { k: 'On the map', v: String(count) }, { k: 'Finished', v: String(fin.length) }],
    leaders: leaders.map((x) => ({ k: x.name, v: x.finished ? 'Finished ' + x.finished : x.where, photo: x.photo || null })), follow: { url, label: 'Watch the race' }, refresh: { tool: 'event_status', args: { event: nm, units: f.system } }, sponsor, units: f.system, updated: 'Live · updated ' + ago(m.body && m.body.now || now, now) };
  return { text, structured: S, map };
}

// ---------------------------------------------------------------- club_in_race: a club or team in a race (Wes, 17 Oct: "How is the UCT team
// doing in the Comrades?" shows all their people, and clicking one shows that person). Exactly what the club page's Happening now shows
// anyone (GET /api/live/club/<slug>: Findable members only, the apps' own rules: never a private run, never anyone who stopped sharing,
// never a position near the start or finish), narrowed to the race. Windline clubs on rides, tours and races; RunFast clubs.
const CLUB_FILLER = new Set(['team', 'teams', 'club', 'clubs', 'our', 'my', 'guys', 'crew', 'squad', 'members', 'people', 'gang', 'lot', 'doing', 'how', 'is', 'are', 'going', 'peeps', 'folks', 'everyone']);
const CLUBISH = /\b(club|team|squad|crew|riders|runners|harriers|striders|athletic|ac|rc|cc|tri|wheelers|cycling|running)\b/i;
/** The demo clubs (the apps' own: RunFast's demo club in the Comrades demo, Windline's Coast Riders in the Coast Classic demo). By their
 *  name, only while the apps list their demo people (config/demo.listed); with the word "demo", always, as the demo races. */
const DEMO_CLUBS = [
  { app: 'runfast', slug: 'demo', name: 'RunFast Demo Club', words: ['runfast', 'demo', 'club'], race: 'comrades-demo', raceWords: ['comrades', 'demo'], colour: '#0E1B26', accent: '#E8B21E', url: 'https://runfast.tech/c/demo' },
  { app: 'windline', slug: 'demo', name: 'Coast Riders (demo)', words: ['coast', 'riders', 'demo'], race: 'coast-demo', raceWords: ['coast', 'classic', 'demo'], colour: '#0A2540', accent: '#2BE0B4', url: null },
];
/** A club's address the user pasted (windline.tech/c/<slug>, runfast.tech/c/<slug>, …/live/club/<slug>) → { app, slug }. */
export function parseClub(s) {
  const m = String(s || '').trim().match(/^(?:https?:\/\/)?(?:www\.)?(windline|runfast)\.tech\/(?:c|live\/club)\/([a-z0-9][a-z0-9-]{1,47})\/?(?:[?#].*)?$/i);
  return m ? { app: m[1].toLowerCase(), slug: m[2].toLowerCase() } : null;
}
/** A club's logo, only from the apps' own hosts or their storage (the widget may load nothing else), else null: a monogram instead. */
function logoOf(u) {
  if (!u || typeof u !== 'string') return null;
  try { const x = new URL(u); return x.protocol === 'https:' && /^(windline\.tech|runfast\.tech|firebasestorage\.googleapis\.com|storage\.googleapis\.com)$/.test(x.hostname) ? x.href : null; } catch (e) { return null; }
}
const clubWordsOf = (q) => words(q).filter((x) => !CLUB_FILLER.has(x) && !STOP.has(x));
/** The clubs a question means → [{ app, slug, name, logo, colour, url, demo }]. */
async function clubsFor(R, q, race) {
  const addr = parseClub(q);
  if (addr) {
    if (addr.slug === 'demo') return DEMO_CLUBS.filter((d) => d.app === addr.app).map((d) => ({ ...d, demo: true }));
    const r = await R.profile(addr.app, 'slug=' + encodeURIComponent(addr.slug)), p = r.ok && r.body && r.body.profiles && r.body.profiles[0];
    return p && p.type !== 'organiser' ? [{ app: addr.app, slug: p.slug, name: p.name, logo: logoOf(p.logo), colour: p.colour || null, url: p.url || null, area: p.area || null }] : [];
  }
  const all = words(q), sig = clubWordsOf(q);
  // the demo clubs: "the demo club", "Coast Riders", "RunFast Demo Club"; a race named picks between them
  const demoHits = DEMO_CLUBS.map((d) => ({ d, n: all.filter((x) => d.words.some((y) => y.startsWith(x))).length, all: sig.length > 0 && sig.every((x) => d.words.some((y) => y.startsWith(x))) }))
    .filter((x) => x.all && (!race || words(race).filter((w) => !STOP.has(w)).every((w) => x.d.raceWords.some((y) => y.startsWith(w)))));
  const askedDemo = wantsDemo(q, race);
  let demoPick = null;
  if (demoHits.length) { demoHits.sort((a, b) => b.n - a.n); demoPick = { ...demoHits[0].d, demo: true }; }
  if (demoPick && askedDemo) return [demoPick];
  // the apps' page search (their own rule: every word the start of a word in the name), clubs only; then without the generic words
  const look = async (text) => {
    const both = await Promise.all(['windline', 'runfast'].map((a) => R.profile(a, 'q=' + encodeURIComponent(text.slice(0, 60)))));
    return both.flatMap((r, i) => (r.ok && r.body && Array.isArray(r.body.profiles) ? r.body.profiles.filter((p) => p.type === 'club' && !p.coach && !(p.slug === 'demo')).map((p) => ({ app: p.app || ['windline', 'runfast'][i], slug: p.slug, name: p.name, logo: logoOf(p.logo), colour: p.colour || null, url: p.url || null, area: p.area || null })) : []));
  };
  let found = [];
  if (sig.join('').length >= 2) { found = await look(all.filter((x) => !STOP.has(x)).join(' ')); if (!found.length) found = await look(sig.join(' ')); }
  if (!found.length && demoPick && (await demoListed(R, demoPick.app))) return [demoPick]; // a real club of that name first; the demo by its name only while it's listed
  return found.slice(0, 6);
}
/** A club's people now, narrowed to the race (if named): the public club feed, as norm()'d people. */
async function clubPeople(R, c, race) {
  const r = await R.club(c.app, c.slug);
  if (!r.ok) return { down: r.status === 0 || r.status >= 500, people: [] };
  let L = listOf(r.body).map((v) => ({ ...norm(c.app, v), found: true })).filter((p) => p.status !== 'stopped'); // on the club's map by their own choice (Findable): by full name
  if (c.demo) L = L.filter((p) => p.event && p.event.id === c.race);
  if (race && !c.demo) L = L.filter((p) => p.event && hit(p.event.name, race));
  if (r.body && r.body.club && r.body.club.name && !c.name) c.name = r.body.club.name;
  return { people: L, now: (r.body && r.body.now) || null };
}
const KM_SORT = (a, b) => (b.status === 'finished') - (a.status === 'finished') || (a.status === 'finished' ? (a.finish - a.started) - (b.finish - b.started) : (b.km || 0) - (a.km || 0));
/** The goal delta in a few characters: "+4:10", "−1:05", "On pace". */
const deltaOf = (p) => (p.goal && p.ghost && typeof p.ghost.diff === 'number' ? (Math.abs(p.ghost.diff) < 30 ? 'On pace' : (p.ghost.diff > 0 ? '+' : '−') + hms(Math.abs(p.ghost.diff))) : null); // always m:ss (h:mm:ss over an hour), as the person card

async function clubCard(ctx, c, people, race, extra = {}) {
  const coach = c.kind === 'coach'; // a coach's athletes in one race (coach-line, 18 Oct): the same card, the coach in the club's place
  const { R, f0, now } = ctx, app = c.app, sport = app === 'runfast' ? 'run' : 'ride', sponsor = sponsorLine(await sponsorName(R));
  const byEvent = {}; people.forEach((p) => { const k = p.event ? p.event.id : '_'; (byEvent[k] = byEvent[k] || []).push(p); });
  const evIds = Object.keys(byEvent).sort((a, b) => byEvent[b].length - byEvent[a].length), mainId = evIds[0], list = byEvent[mainId].slice().sort(KM_SORT);
  const ev = list[0].event, raceName = ev ? ev.name : (app === 'runfast' ? 'a run' : 'a ride'), others = evIds.slice(1).map((k) => ({ name: byEvent[k][0].event ? byEvent[k][0].event.name : 'other events', n: byEvent[k].length }));
  let course = null, cbody = null;
  if (ev) { const cr = await R.course(app, ev.id); if (cr.ok) { cbody = cr.body; course = coursePoints(app, cr.body, ev.dayId); } }
  const tz = (ev && ev.tz) || (cbody && cbody.tz) || null, f = f0(tz), n = list.length, who = n === 1 ? PERSON[app] : PERSON[app] + 's';
  const on = list.filter((p) => MOVING.includes(p.status) || p.status === 'paused' || p.status === 'waiting'), fin = list.filter((p) => p.status === 'finished');
  const subOf = (p) => (p.status === 'finished' && p.finish && p.started ? 'Finished ' + hms((p.finish - p.started) / 1000) : sharesPosition(p) ? f.atShort(p.km) + (deltaOf(p) ? ' · ' + deltaOf(p) : '') : p.status === 'paused' ? 'Paused' : p.status === 'waiting' ? 'Not started' : 'On the course');
  const members = list.slice(0, 40).map((p) => ({ id: idOf(p, null), name: nameOf(p).replace(/\s*\(demo\)\s*$/i, ''), photo: photoFor(p), status: p.status, sub: subOf(p), km: sharesPosition(p) ? +p.km.toFixed(1) : null, goal_delta: deltaOf(p), can_tap: !!(p.tapsOn && p.tapsOpen), team: p.team || null }));
  const tappable = members.filter((m) => m.can_tap).length, lead = list.find(sharesPosition);
  const clubName = c.name.replace(/\s*\(demo\)\s*$/i, ' (demo)'), shown = clubName.replace(/\s*\(demo\)$/i, '') /* "demo" once, in the race's name */, raceShort = raceName.replace(/^the /i, '');
  const club_url = coach ? `${SITE[app]}/live/race/${encodeURIComponent(c.raceId)}` : `${SITE[app]}/live/club/${encodeURIComponent(c.slug)}`;
  const lines = [`${/\(demo\)/i.test(raceName) ? shown : clubName}: ${n} ${who} in the ${raceShort}` + (fin.length ? `, ${fin.length} finished` : '') + '.'];
  if (lead) lines.push(`Out front${coach ? '' : ' for the club'}: ${nameOf(lead)} at ${f.at(lead.km)}${lead.total ? ' of ' + f.dist(lead.total) : ''}.`);
  lines.push(members.slice(0, 12).map((m, i) => `${i + 1}. ${m.name}, ${m.sub} [person: ${m.id}]`).join('\n'));
  if (members.length > 12) lines.push(`…and ${members.length - 12} more on the club's map.`);
  if (others.length) lines.push(`Also on the club's map: ${others.map((o) => `${o.n} in ${o.name}`).join(', ')}.`);
  if (extra.note) lines.push(extra.note);
  lines.push(`Tap a ${PERSON[app]} on the card to see them; or call where_is with their person id.`);
  lines.push(`Watch the ${coach ? 'race' : 'club'} live: ${club_url}`);
  const text = lines.join('\n') + '\n\n' + sponsor;
  const S = { view: 'club', ...(coach ? { coach: { name: clubName, app, slug: c.slug, url: c.url || null, ...(c.demo ? { demo: true } : {}) } } : { club: { name: clubName, app, slug: c.slug, url: c.url || null } }), sport: SPORT[app], race: raceName, count: n, finished_count: fin.length, on_course: on.length, members, can_tap_team: tappable > 0, club_url, units: f.system, sponsor_line: sponsor };
  const ref = c.demo && !coach ? `${app}:demo` : `${app}:${c.slug}`, key = coach ? 'coach' : 'club', ev0 = coach ? c.raceId : race || raceName;
  const map = {
    kind: 'club', sport, app, name: /\(demo\)/i.test(raceName) ? shown : clubName, race: raceName, status: 'live', statusWord: 'Live',
    club: { slug: c.slug, name: clubName, logo: c.logo || null, colour: c.colour || null, accent: c.accent || null, initials: clubName.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase() },
    subtitle: coach ? `${n} ${who} in the ${raceShort}` : `${n} of our ${who} in the ${raceShort}`, ...(coach ? { teamTitle: sport === 'run' ? 'Their runners' : 'Their riders' } : {}),
    course: course ? thin(course.pts, 600) : [], progress: 0,
    dots: list.filter(sharesPosition).slice(0, 60).map((p, i) => ({ lat: p.last.lat, lon: p.last.lon, lead: i === 0, id: idOf(p, null), label: nameOf(p) + ' · ' + f.atShort(p.km) })), // the map's dots: name and km on hover, a tap opens their card
    headline: on.length + ' on the course' + (fin.length ? ' · ' + fin.length + ' finished' : ''),
    members, total: n,
    stats: [{ k: 'On the course', v: String(on.length) }, { k: 'Finished', v: String(fin.length) }].concat(lead ? [{ k: 'Out front', v: f.atShort(lead.km), sub: firstName(lead.name) }] : []), // the count is in the header
    follow: { url: club_url, label: coach ? 'Watch the race live' : 'Watch the club live' },
    refresh: { tool: 'club_in_race', args: { [key]: ref, event: ev0, units: f.system } },
    tap: tappable ? { [key]: ref, event: ev0, team: true, n: tappable, label: 'Give the team a tap on the back' } : null,
    updated: 'Positions ' + ago(ctx.feedNow || now, now), sponsor, units: f.system,
  };
  return { text, structured: S, map };
}
/** clubInRace's search, shared with the team tap: → { c, people } or { text, structured } (why not). */
async function findClubInRace(ctx, args) {
  if (args.coach) return findCoachInRace(ctx, args);
  const { R } = ctx, raw = String(args.club || '').trim(), race = String(args.event || '').trim();
  if (!raw) return { text: 'Which club or team? Its name, or its page address (windline.tech/c/…, runfast.tech/c/…).' };
  let clubs;
  const m = raw.match(/^(windline|runfast):([a-z0-9][a-z0-9-]{1,47})$/); // the card's own reference
  if (m) clubs = m[2] === 'demo' ? DEMO_CLUBS.filter((d) => d.app === m[1]).map((d) => ({ ...d, demo: true })) : [{ app: m[1], slug: m[2], name: '', logo: null, colour: null, url: null }];
  else clubs = await clubsFor(R, raw, race);
  if (m && !m[2].startsWith('demo') && clubs[0]) { const p = await R.profile(m[1], 'slug=' + encodeURIComponent(m[2])), x = p.ok && p.body && p.body.profiles && p.body.profiles[0]; if (x) Object.assign(clubs[0], { name: x.name, logo: logoOf(x.logo), colour: x.colour || null, url: x.url || null }); }
  if (!clubs.length) return { text: `I couldn't find a club called "${raw}" on Windline or RunFast. Ask the user for the club's name as it's written on its page, or its address (windline.tech/c/…, runfast.tech/c/…).`, miss: true };
  const got = await Promise.all(clubs.map((c) => clubPeople(R, c, race)));
  const live = clubs.map((c, i) => ({ c, ...got[i] })).filter((x) => x.people.length);
  if (!live.length) {
    if (got.some((g) => g.down)) return { text: `livedot couldn't reach ${[...new Set(clubs.map((c) => NAME[c.app]))].join(' or ')} just now, so I can't say how ${clubs[0].name || raw} is doing. Try again in a moment.`, down: true };
    const nm = clubs.length === 1 ? clubs[0].name || raw : `${clubs.length} clubs match "${raw}" (${clubs.map((c) => c.name).join('; ')}), and none of them`;
    return { text: clubs.length === 1 ? `No one from ${nm} is on the club's live map${race ? ' in ' + race : ''} right now. Only members who chose to be findable, sharing their position, show there.` : `${nm} has anyone on its live map${race ? ' in ' + race : ''} right now.` };
  }
  if (live.length > 1) return { pick: teamPicker(ctx, 'club', raw, race, live.map((x) => ({ c: x.c, n: x.people.length }))) }; // several clubs: which one, as the person search asks (a picker)
  return { c: live[0].c, people: live[0].people, now: live[0].now };
}
export async function clubInRace(ctx, args) {
  const sponsor = sponsorLine(await sponsorName(ctx.R)), r = await findClubInRace(ctx, args);
  if (r.pick) return { text: r.pick.text + '\n\n' + sponsor, structured: { ...r.pick.structured, sponsor_line: sponsor }, map: { ...r.pick.map, sponsor } };
  if (!r.c) return { text: r.text + '\n\n' + sponsor, structured: { view: 'none', message: r.text, ...(r.clubs ? { clubs: r.clubs } : {}), ...(r.upcoming ? { upcoming: r.upcoming } : {}), ...(r.down ? { upstream_error: true } : {}) }, map: null };
  return clubCard({ ...ctx, feedNow: r.now }, r.c, r.people, String(args.event || '').trim());
}
/** "Give the team a tap on the back": one tap to each member on the map who takes taps (their own switch, open while they race and
 *  the day after the finish), each through the apps' own tap with its caps (one a minute from you to each of them). */
async function tapTeam(ctx, args, tapAt, sponsor) {
  const r = await findClubInRace(ctx, args);
  if (r.pick) return { text: r.pick.text + '\n\n' + sponsor, structured: { view: 'none', message: r.pick.text }, map: null };
  if (!r.c) return { text: r.text + '\n\n' + sponsor, structured: { view: 'none', message: r.text }, map: null };
  const people = r.people.filter((p) => p.tapsOn && p.tapsOpen).slice(0, 40), skipped = r.people.length - people.length;
  if (!people.length) { const t = `No one from ${r.c.name} on the map takes taps on the back just now.`; return { text: `${t}\n\n${sponsor}`, structured: { view: 'none', message: t }, map: null }; }
  const res = []; for (let i = 0; i < people.length; i += 6) res.push(...(await Promise.all(people.slice(i, i + 6).map((p) => tapAt(p.app, { pid: p.pid })))));
  const sent = res.filter((o) => o.status === 200 && o.body && o.body.ok), demo = sent.some((o) => o.body.demo), again = res.filter((o) => o.status === 429 && /another in a minute/.test(String(o.body && o.body.error))).length;
  const named = sent.some((o) => o.body.named), who = PERSON[r.c.app] + (sent.length === 1 ? '' : 's');
  let line;
  if (!sent.length) line = again ? `You gave the team a tap a moment ago: you can give another in a minute.` : 'The taps didn’t go through just now. Try again in a moment.';
  else line = `Taps sent to ${sent.length} ${who} from ${r.c.name}` + (demo ? ' (the demo: they feel it, nothing is kept)' : '') + '.' + (skipped + (people.length - sent.length) > 0 ? ` ${skipped + people.length - sent.length} didn't get one (taps off, finished more than a day ago, or tapped a moment ago).` : '');
  if (!sent.length) return { text: `${line}\n\n${sponsor}`, structured: { view: 'none', message: line }, map: null };
  const card = await clubCard({ ...ctx, feedNow: r.now }, r.c, r.people, String(args.event || '').trim());
  return { text: `${line}${named ? '' : ' (No name on them: connect your Windline or RunFast account, or tell me your first name, so they see who it was.)'}\n\n${card.text}`,
    structured: { ...card.structured, view: 'tap', sent: true, finished: false, named, taps_sent: sent.length, team: r.c.name }, map: card.map };
}

// ---------------------------------------------------------------- a coach's athletes in a race (coach-line, Wes 18 Oct: "How are Coach
// Nadia's runners doing in the Comrades?"): the coach's live feed (GET /api/live/coach/<slug>, Findable athletes on public races only),
// shown as the club's team card. Ambiguity as the person search: several coaches (or clubs) → a picker; no race named → the one race
// they're live in, a race picker for several, or "none racing right now" with their next public events.
const GROUP = /\b(runners?|riders?|athletes?|cyclists?|squad|group|training|team|people|crew|guys|lot)\b/gi;
/** "Coach Nadia's runners", "how are Nadia Pillay's athletes doing" → the name words, and the app the group word points to. */
export function coachAskOf(q) {
  const t = String(q || ''), app = /\b(runners?|running)\b/i.test(t) ? 'runfast' : /\b(riders?|cyclists?|cycling)\b/i.test(t) ? 'windline' : null;
  const name = t.replace(/['’]s?\b/g, ' ').replace(GROUP, ' ').replace(/\b(how|are|is|doing|going|in|at|the|my|our|her|his|their|of)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return { name, app };
}
/** A question about a coach's people ("Coach Nadia", "Nadia's runners"), not a person's name. */
export const isCoachAsk = (q) => /^\s*coach\b/i.test(String(q || '')) || /['’]s?\s+(runners|riders|athletes|cyclists|squad|training group)\b/i.test(String(q || ''));
const refOf = (c) => `${c.app}:${c.slug}`;
/** The coach pages a question means (the apps' page search, coach: true) → [{ kind, app, slug, name, logo, url, area, demo }]. */
async function coachesFor(R, raw) {
  const m = String(raw || '').trim().match(/^(windline|runfast):([a-z0-9][a-z0-9-]{1,47})$/);
  if (m) return [{ kind: 'coach', app: m[1], slug: m[2], name: '', logo: null, url: null, area: null }];
  const { name, app } = coachAskOf(raw);
  const look = async (text) => {
    const both = await Promise.all(['windline', 'runfast'].map((a) => R.profile(a, 'q=' + encodeURIComponent(text.slice(0, 60)))));
    return both.flatMap((r, i) => (r.ok && r.body && Array.isArray(r.body.profiles) ? r.body.profiles.filter((p) => p.coach === true || p.type === 'coach').map((p) => ({ kind: 'coach', app: p.app || ['windline', 'runfast'][i], slug: p.slug, name: p.name, logo: logoOf(p.logo), url: p.url || null, area: p.area || null, ...(p.demo ? { demo: true } : {}) })) : []));
  };
  if (words(name).length === 0) return [];
  let found = await look(name); if (!found.length && /^coach\s/i.test(name)) found = await look(name.replace(/^coach\s+/i, ''));
  if (app && found.some((c) => c.app === app)) found = found.filter((c) => c.app === app); // "runners": RunFast's coaches
  return found.slice(0, 8);
}
/** Several clubs or coaches (or a coach's races): a picker card, as "which Megan?". Rank: athletes live in the named race, then the
 *  nearest to the asker, then the closest name. Each row opens the team card in place (club_in_race through callTool). */
function teamPicker(ctx, kind, raw, race, list) {
  const at = placeHint(ctx.meta), km = (c) => (at && at.lat != null && c.area && isFinite(c.area.lat) ? Math.hypot((c.area.lat - at.lat) * 111, (c.area.lon - at.lon) * 111 * Math.cos(at.lat * Math.PI / 180)) : Infinity);
  const nameHit = (c) => (words(c.name).join(' ') === words(coachAskOf(raw).name).join(' ') ? 2 : hit(c.name, coachAskOf(raw).name) ? 1 : 0);
  const sorted = list.slice().sort((a, b) => (b.n > 0) - (a.n > 0) || km(a.c) - km(b.c) || nameHit(b.c) - nameHit(a.c) || b.n - a.n || a.c.name.localeCompare(b.c.name));
  const units = ctx.f0(null).system, who = (c) => PERSON[c.app] + 's', word = kind === 'coach' ? 'coaches' : 'clubs';
  const rows = sorted.map(({ c, n }) => ({ id: refOf(c), name: c.name.replace(/\s*\(demo\)\s*$/i, ''), photo: c.logo || null, sport: SPORT[c.app], app: c.app, area: c.area ? c.area.name : null, live_count: n,
    sub: [c.area && c.area.name, SPORT[c.app].replace(/^./, (x) => x.toUpperCase()) + ' · ' + NAME[c.app], n ? `${n} ${n === 1 ? PERSON[c.app] : who(c)} live${race ? ' in ' + race.replace(/^the /i, '') : ''}` : 'None racing now'].filter(Boolean).join(' · '),
    live: n > 0, call: { tool: 'club_in_race', args: { [kind]: refOf(c), ...(race ? { event: race } : {}), units } } }));
  const head = `${rows.length} ${word} match "${raw}"${race ? ' (' + race + ')' : ''}:`;
  const text = `${head}\n${rows.map((r, i) => `${i + 1}. ${r.name} (${r.sport}, ${NAME[r.app]}${r.area ? ', ' + r.area : ''}): ${r.live_count ? r.live_count + ' live' + (race ? ' in ' + race : '') : 'none racing now'} [${kind}: ${r.id}]`).join('\n')}\n\nAsk the user which one (never guess), then call club_in_race with ${kind}: "<id>".`;
  return { text, structured: { view: 'picker', pick: kind, total: String(rows.length), options: rows.map(({ call, sub, live, ...x }) => x) },
    map: { kind: 'picker', pick: 'team', title: `${rows.length} ${word} match "${coachAskOf(raw).name || raw}"`, subtitle: race ? 'in the ' + race.replace(/^the /i, '') : 'live on livedot', query: raw, rows, total: String(rows.length), units } };
}
/** A coach's races now (no race named, several): a picker of the races, each opening the team card in that race. */
function racePicker(ctx, c, races) {
  const units = ctx.f0(null).system, who = PERSON[c.app] + 's';
  const rows = races.map((r) => ({ id: refOf(c) + '@' + r.id, name: r.name, photo: null, sport: SPORT[c.app], app: c.app, live_count: r.count, sub: `${r.count} of ${c.name.replace(/\s*\(demo\)\s*$/i, '')}'s ${r.count === 1 ? PERSON[c.app] : who} live`, live: true,
    call: { tool: 'club_in_race', args: { coach: refOf(c), event: r.id, units } } }));
  const text = `${c.name}'s ${who} are live in ${races.length} races: ${races.map((r, i) => `${i + 1}. ${r.name} (${r.count}) [race: ${r.id}]`).join('; ')}. Ask the user which race, then call club_in_race with coach: "${refOf(c)}" and event: the race id.`;
  return { text, structured: { view: 'picker', pick: 'race', coach: { name: c.name, app: c.app, slug: c.slug }, total: String(rows.length), options: rows.map(({ call, sub, live, ...x }) => x) },
    map: { kind: 'picker', pick: 'team', title: `${c.name.replace(/\s*\(demo\)\s*$/i, '')}: ${races.length} races live`, subtitle: 'Which race?', query: '', rows, total: String(rows.length), units } };
}
/** clubInRace's search for a coach → { c, people, now } (the team card), { pick } (a picker) or { text } (why not). */
async function findCoachInRace(ctx, args) {
  const { R } = ctx, raw = String(args.coach || '').trim(), race = String(args.event || '').trim();
  if (!raw) return { text: 'Which coach? Their name as it\'s written on their livedot page.' };
  const cands = await coachesFor(R, raw);
  if (!cands.length) return { text: `I couldn't find a coach called "${coachAskOf(raw).name || raw}" on Windline or RunFast. Ask the user for the coach's name as it's written on their livedot page.`, miss: true };
  const feeds = await Promise.all(cands.map((c) => R.coach(c.app, c.slug)));
  const down = feeds.every((f) => f.status === 0 || f.status >= 500);
  const all = cands.map((c, i) => { const b = feeds[i].ok ? feeds[i].body || {} : {}; if (b.coach) Object.assign(c, { name: c.name || b.coach.name, url: c.url || b.coach.url || null, ...(b.coach.demo ? { demo: true } : {}) });
    const races = Array.isArray(b.races) ? b.races.filter((x) => x && x.id) : [], inRace = race ? races.filter((x) => x.id === race || hit(x.name, race)) : races;
    return { c, races, inRace, n: inRace.reduce((t, x) => t + (+x.count || 0), 0), body: b }; }).filter((x) => x.c.name);
  if (!all.length) return { text: down ? `livedot couldn't reach Windline or RunFast just now. Try again in a moment.` : `I couldn't find a coach called "${raw}".`, down };
  const live = all.filter((x) => x.inRace.length);
  if (live.length > 1 || (!live.length && all.length > 1)) return { pick: teamPicker(ctx, 'coach', raw, race, (live.length ? live : all).map((x) => ({ c: x.c, n: x.n }))) };
  const x = live[0] || all[0], c = x.c, nm = c.name.replace(/\s*\(demo\)\s*$/i, ''), who = PERSON[c.app] + 's';
  if (!x.inRace.length) { // none of theirs live (in that race): say so plainly, with where they are live, or their next public events
    if (race && x.races.length) return { text: `None of ${nm}'s ${who} are live in ${race} right now. Live now: ${x.races.map((r) => `${r.name} (${r.count})`).join(', ')}.` };
    const p = await R.profile(c.app, 'slug=' + encodeURIComponent(c.slug)), up = ((p.ok && p.body && p.body.profiles && p.body.profiles[0] && p.body.profiles[0].events && p.body.profiles[0].events.upcoming) || []).slice(0, 3);
    return { text: `None of ${nm}'s ${who} are racing right now.` + (up.length ? ` Next: ${up.map((e) => `${e.name}${e.start || e.date ? ', ' + String(e.start || e.date).slice(0, 10) : ''}`).join('; ')}.` : ''), upcoming: up.map((e) => ({ name: e.name, start: e.start || e.date || null, url: e.url || null })) };
  }
  if (x.inRace.length > 1) return { pick: racePicker(ctx, c, x.inRace) };
  const r0 = x.inRace[0], f = x.body.race && x.body.race.id === r0.id && listOf(x.body).length ? { ok: true, body: x.body } : await R.coach(c.app, c.slug, r0.id);
  if (!f.ok) return { text: `livedot couldn't reach ${NAME[c.app]} just now, so I can't say how ${nm}'s ${who} are doing. Try again in a moment.`, down: true };
  const people = listOf(f.body).map((v) => ({ ...norm(c.app, v), found: true })).filter((p) => p.status !== 'stopped');
  if (!people.length) return { text: `None of ${nm}'s ${who} are on the map in ${r0.name} right now.` };
  return { c: { ...c, kind: 'coach', raceId: r0.id }, people, now: f.body.now || null };
}

export const _test = { norm, parseLink, closeness, hit, cache, parseClub, CLUBISH, coachAskOf, isCoachAsk };

// ---------------------------------------------------------------- event_weather (src/eventweather.js), with the same sponsor line
import { eventWeather, flyRoute, tourRoute, tourNotes } from './eventweather.js';
export async function eventWeatherTool(ctx, args) { return eventWeather(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
export async function flyRouteTool(ctx, args) { return flyRoute(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
export async function tourRouteTool(ctx, args) { return tourRoute(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
export async function tourNotesTool(ctx, args) { return tourNotes(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
/** The sponsor line, for livedot MCP's other tools (writes.js). */
export async function sponsorLineFor(R) { return sponsorLine(await sponsorName(R)); }
/** The sponsor's name and link (Windline's sponsor read: its counted link, windline.tech/go/platform; ProLend's own site if it can't be read). */
export const SPONSOR_SITE = 'https://pro-lend.co.za';
export async function sponsorInfo(R) {
  return held('sponsor-info', 10 * 6e4, async () => { const r = await R.sponsor(), x = r.ok && r.body && r.body.sponsor; return { name: (x && x.name) || SPONSOR_FALLBACK, url: x && /^https:\/\//.test(String(x.url || '')) ? x.url : SPONSOR_SITE }; })
    .catch(() => ({ name: SPONSOR_FALLBACK, url: SPONSOR_SITE }));
}
