// The three tools. Every fact comes from the public reads (reads.js) and every weather number from the one engine (weather.js).
// Privacy (README, "For the auditor"): a position (a km, a mile, a dot, the weather there) is shared only when the public follow
// answer gives one (`last`) and the person is moving (live, delayed, no signal); paused, stopped, waiting, hidden near the start or
// finish, private or not shared: "I can't share where they are right now". Names as the public-name rule shows them ("Megan N.").
import { WL } from './gen/engine.js';
import { reads, SITE, SPORT, PERSON, NAME, DEMOS, isDemo } from './reads.js';
import { unitsFor, hms, span, ago, clock, shortName, firstName } from './words.js';
import { coursePoints, weatherFor, colourOf, KEY, HARD_WORDS, HEAT_WORDS } from './weather.js';

const MOVING = ['live', 'delayed', 'nosignal'];
const HANDLE = /^[a-z][a-z0-9-]{2,29}$/;
const STOP = new Set(['the', 'in', 'at', 'a', 'an', 'of', 'race', 'today', 'this', 'year', 'event']);
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
/** Every word typed is the start of a word in the text (livedot.me's search rule). */
export const hit = (text, q) => { const t = words(text), w = words(q).filter((x) => !STOP.has(x)); return w.length > 0 && w.every((x) => t.some((y) => y.startsWith(x))); };
const cid = (id) => String(id || '').replace(/^run:/, 'run-'); // RunFast spells a club race 'run:<id>' in entries and 'run-<id>' in addresses

export const SPONSOR_FALLBACK = 'ProLend';
const sponsorLine = (name) => `Live tracking, proudly brought to you free thanks to ${name || SPONSOR_FALLBACK}.`;

// ---------------------------------------------------------------- one shape for both apps' Live
function norm(app, v) {
  const ev = app === 'windline' ? v.event : v.race;
  return {
    app, pid: v.pid, name: v.name || (app === 'windline' ? 'Rider' : 'Runner'), status: v.status || (v.live ? 'live' : null),
    km: typeof v.km === 'number' ? v.km : null, total: v.total || null, speed: v.speed, pace: v.pace, plan: v.plan || null, goal: v.goal || null,
    ghost: v.ghost || null, finish: v.finish || null, started: v.started || null, last: v.last || null, seen: v.seen || null,
    taps: v.taps && typeof v.taps.count === 'number' ? v.taps.count : 0, free: v.kind === 'free',
    bib: v.bib != null ? String(v.bib) : null, club: v.club ? String(v.club.name || v.club) : null, place: v.place || v.city || v.country || null, wave: v.wave || null, // only when an answer carries them
    event: ev ? { id: cid(ev.id), name: ev.name, tz: ev.tz || null, dayId: ev.day && ev.day.id, dayLabel: ev.day && ev.day.label } : null,
  };
}
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
  return held('live', 30e3, async () => {
    const both = await Promise.all(['windline', 'runfast'].map((a) => R.profile(a, 'live=1&limit=100')));
    return both.flatMap((r, i) => (r.ok && r.body && Array.isArray(r.body.events) ? r.body.events.map((e) => ({ ...e, app: e.app || ['windline', 'runfast'][i] })) : []));
  });
}
async function upcomingRaces(R) {
  return held('upcoming', 60e3, async () => {
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
  const tz = (p.event && p.event.tz) || (cbody && cbody.tz) || null, f = f0(tz), name = shortName(p.name), first = firstName(p.name).replace(/^(.)/, (c) => c.toUpperCase());
  const race = p.event ? p.event.name.replace(/\s*\(demo\)\s*$/i, ' (demo)') : p.free ? 'a ride of their own (Ride live)' : null;
  const shared = sharesPosition(p), url = followUrl(p, via), sponsor = sponsorLine(await sponsorName(R));
  const S = { view: 'person', id: idOf(p, via), name, app: p.app, sport: SPORT[p.app], status: p.status, race, follow_url: url, units: f.system, sponsor_line: sponsor };
  const lines = [], stats = [];
  const total = p.total || (course && course.km) || null;
  let w = null;

  if (shared) {
    const kmNow = p.km, pct = total ? Math.min(1, kmNow / total) : null;
    S.position = { km: +kmNow.toFixed(2), mile: +(kmNow * 0.621371).toFixed(2), of_km: total, percent: pct == null ? null : Math.round(pct * 100), seen: new Date(p.last.t || p.seen || now).toISOString() };
    let s1 = `${name} is at ${f.at(kmNow)}` + (total ? ` of ${f.dist(total)}` : '') + (race ? ` in the ${race.replace(/^the /i, '')}` : '');
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
    lines.push(`${name} has finished` + (race ? ` the ${race.replace(/^the /i, '')}` : '') + (t ? ` in ${hms(t / 1000)}` : '') + (p.goal && t ? (t / 1000 <= p.goal ? `, inside the ${hms(p.goal)} goal` : `, against a ${hms(p.goal)} goal`) : '') + '.');
    S.finished = { time: t ? hms(t / 1000) : null, at: p.finish ? new Date(p.finish).toISOString() : null };
  } else if (p.status === 'waiting') {
    const st = p.plan && p.plan.start ? Date.parse(p.plan.start) : cbody && cbody.start ? Date.parse(cbody.start) : null;
    lines.push(`${name} hasn't started yet` + (race ? ` in the ${race.replace(/^the /i, '')}` : '') + (st && st > now ? `; the start is at ${clock(st, tz, f)} race time` : '') + '.');
  } else if (p.status === 'stopped') {
    lines.push(`${name} stopped before the finish` + (race ? ` of the ${race.replace(/^the /i, '')}` : '') + ', so I can\'t share where they are.');
  } else {
    lines.push(`${name} is ${p.status === 'paused' ? 'paused' : 'out on the course'}` + (race ? ` in the ${race.replace(/^the /i, '')}` : '') + ', but I can\'t share where they are right now' + (p.status === 'paused' ? '' : ' (the live page hides positions near the start and finish)') + '.');
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
    follow: { url, label: via && via.handle ? 'Follow live' : 'Watch live' }, handle: via && via.handle || null,
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
      return { p: norm(m[1], v), via: null };
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
      return { text: `${nm} isn't racing right now` + (up ? `. Next: ${up.name}${up.date ? ' on ' + up.date : ''}` : '') + `. Their livedot page: ${SITE.livedot}/${b.handle}` };
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
  const { R } = ctx, sponsor = sponsorLine(await sponsorName(R)), r = await resolve(ctx, args);
  const tapAt = async (app, target) => {
    let res; try { res = await fetch(`${R.H.mcp}/tap`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ctx.proxy || {}), ...(ctx.authorization ? { Authorization: ctx.authorization } : {}) },
      body: JSON.stringify({ app, ...target, name: args.name ? String(args.name).slice(0, 40) : undefined, asker: ctx.asker || undefined }), signal: AbortSignal.timeout(15000) }); } catch (e) { return { status: 502, body: {} }; }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
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
  const done = !!out.body.finished, line = out.body.demo ? `Tap sent. ${who} (the demo runner) feels it in the demo; nothing is kept.` : done ? `Tap sent. ${who} finished, so it lands as a congratulation on their phone.` : `Tap sent. ${who} will feel it on their phone.`;
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
  let people = [], scope = null, capped = false;
  const letters = q.replace(/[^A-Za-z]/g, '').length, demo = wantsDemo(q, event);
  if (demo) {
    for (const d of demoRaces(event || q)) { const r = await R.liveByCode(d.app, 'demo'), v = listOf(r.body)[0]; if (v) people.push({ ...norm(d.app, v), via: { code: 'demo' } }); }
    scope = 'the demo races';
  } else if (letters >= 3) {
    const races = event ? (await liveRaces(R)).filter((e) => hit(e.name + ' ' + ((e.organiser && e.organiser.name) || ''), event)).slice(0, 4) : [];
    if (races.length) {
      scope = races.map((e) => e.name).join(' and ');
      const got = await Promise.all(races.map((e) => R.raceMap(e.app, e.id, q)));
      got.forEach((r, i) => { const L = listOf(r.body); if (L.length >= 20) capped = true; L.forEach((v) => people.push(norm(races[i].app, v))); });
    } else {
      const got = await Promise.all(['windline', 'runfast'].map((a) => R.find(a, q)));
      for (let i = 0; i < 2; i++) {
        const a = ['windline', 'runfast'][i], L = listOf(got[i].body).filter((v) => !isDemo(v)); if (L.length >= 20) capped = true;
        if (a === 'runfast' && L.length) { const full = await R.liveByPid(a, L.map((v) => v.pid).slice(0, 20)); const F = listOf(full.body); L.forEach((v) => { const x = F.find((y) => y.pid === v.pid); people.push(norm(a, x || { ...v, status: v.live ? 'live' : null })); }); }
        else L.forEach((v) => people.push(norm(a, v)));
      }
      if (event) people = people.filter((p) => p.event && hit(p.event.name, event));
      scope = event || null;
    }
  }
  if (handleLive) people.unshift(handleLive);
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

  // nobody real and findable, but the race asked about has a demo (Comrades, Coast Classic) and its runner or rider has that
  // name: the demo answers, labelled as the demo (Wes, 17 Oct: "where's Megan in the Comrades" must work for anyone trying it)
  if (!people.length && !demo && letters >= 3) {
    const ask = words(event || '').filter((x) => !STOP.has(x));
    for (const d of ask.length ? DEMOS.filter((x) => ask.some((w) => x.words.some((y) => y !== 'demo' && y.startsWith(w)))) : []) {
      const r = await R.liveByCode(d.app, 'demo'), v = listOf(r.body)[0]; if (!v) continue;
      const p = { ...norm(d.app, v), via: { code: 'demo' } };
      if (closeness(p, q)) return personAnswer(ctx, p, p.via, { note: `This is the ${d.name.replace(/\s*\(demo\)\s*$/i, '')} demo, live on livedot every day, so you can try following someone. The real race shows here when it's on, for everyone who chose to be findable.` });
    }
  }
  if (!people.length) {
    const why = letters < 3 && !demo ? 'Give me at least three letters of their name, or their livedot handle.' : `I couldn't find anyone called "${q}"${scope ? ' in ' + scope : event ? ` in "${event}" (it may not be live right now)` : ''} who is findable on a live race. Only people who chose to be findable show up in search; otherwise ask them for their livedot link (livedot.me/<handle>).`;
    const t = [why, ...narrowed.notes].join(' ');
    return { text: t + '\n\n' + sponsor, structured: { view: 'none', message: t }, map: null };
  }
  // several: the top five for the model and the total; the widget gets the page (up to 20) as a picker
  const total = people.length, label = `${total}${capped ? '+' : ''}`, top = people.slice(0, 5);
  const row = (p) => {
    const f = f0(p.event && p.event.tz), sh = sharesPosition(p);
    return { id: idOf(p, p.via), name: shortName(p.name), sport: SPORT[p.app], race: p.event ? p.event.name : null, status: p.status,
      km_now: sh ? +p.km.toFixed(1) : null, where: sh ? f.atShort(p.km) : p.status === 'finished' ? 'Finished' : p.status === 'waiting' ? 'Not started' : null,
      goal: p.goal && p.ghost && typeof p.ghost.diff === 'number' && sh ? (Math.abs(p.ghost.diff) < 30 ? 'on goal pace' : `${span(p.ghost.diff).replace(/ minutes?$/, ' min')} ${p.ghost.diff > 0 ? 'behind' : 'ahead of'} goal`) : null,
      pace: sh ? (p.app === 'runfast' ? (p.pace > 0 ? f.paceShort(3600 / p.pace) : null) : (p.speed > 0 ? f.speedShort(p.speed) : null)) : null,
      seen: p.last && p.last.t ? ago(p.last.t, now) : p.seen ? ago(p.seen, now) : null, bib: p.bib, club: p.club };
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
  if (!q) return { text: 'Which race?\n\n' + sponsor, structured: { view: 'none' }, map: null };
  let list = [];
  if (wantsDemo(q)) list = demoRaces(q).map((d) => ({ app: d.app, id: d.id, name: d.name, demo: true }));
  else list = (await liveRaces(R)).filter((e) => hit(e.name + ' ' + ((e.organiser && e.organiser.name) || ''), q));
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
  const leaders = [...fin.slice(0, 3).map((p) => ({ name: shortName(p.name), finished: hms(((p.finish || 0) - (p.started || 0)) / 1000) })), ...out.slice(0, 5 - Math.min(3, fin.length)).map((p) => (sharesPosition(p) ? { name: shortName(p.name), km: +p.km.toFixed(1), where: f.atShort(p.km) } : { name: shortName(p.name), km: null, where: 'on the course' }))]; // a km only where the public answer gives a position (KPMG C2: never near the start or finish, never stopped)
  const nm = e.name, lines = [];
  lines.push(`${nm} is live` + (started && isFinite(started) ? `: under way for ${span((now - started) / 1000)} (it's ${clock(now, tz, f)} there)` : '') + '.');
  lines.push(`${count} ${count === 1 ? PERSON[app] : PERSON[app] + 's'} on livedot's map${fin.length ? `, ${fin.length} finished` : ''}.`);
  if (out[0]) lines.push(sharesPosition(out[0]) ? `Out front: ${shortName(out[0].name)} at ${f.at(out[0].km)}${total ? ' of ' + f.dist(total) : ''}.` : `Out front: ${shortName(out[0].name)}, on the course.`);
  if (leaders.length) lines.push('Leaders on the public map: ' + leaders.map((x) => x.name + (x.finished ? ' (finished, ' + x.finished + ')' : ' (' + x.where + ')')).join(', ') + '.');
  const url = app === 'windline' ? `${SITE.windline}/live/race/${encodeURIComponent(e.id)}` : `${SITE.runfast}/live/race/${encodeURIComponent(e.id)}`;
  lines.push(`\nWatch the race live: ${url}`);
  const text = lines.join(' ') + '\n\n' + sponsor;
  const S = { view: 'event', name: nm, app, sport: SPORT[app], started: started && isFinite(started) ? new Date(started).toISOString() : null, on_map: count, finished: fin.length, leaders, url, units: f.system, sponsor_line: sponsor };
  const map = { kind: 'event', sport: app === 'runfast' ? 'run' : 'ride', app, name: nm, race: nm, status: 'live', statusWord: 'Live', course: course ? thin(course.pts, 600) : [], progress: 0,
    dots: out.slice(0, 60).filter(sharesPosition).map((p, i) => ({ lat: p.last.lat, lon: p.last.lon, lead: i === 0 })),
    headline: count + ' ' + (count === 1 ? PERSON[app] : PERSON[app] + 's') + ' on the map',
    stats: [{ k: 'Under way', v: started && isFinite(started) ? hms((now - started) / 1000).replace(/:\d\d$/, '') : '–', sub: 'h:min' }, { k: 'On the map', v: String(count) }, { k: 'Finished', v: String(fin.length) }],
    leaders: leaders.map((x) => ({ k: x.name, v: x.finished ? 'Finished ' + x.finished : x.where })), follow: { url, label: 'Watch the race' }, sponsor, units: f.system, updated: 'Live · updated ' + ago(m.body && m.body.now || now, now) };
  return { text, structured: S, map };
}

export const _test = { norm, parseLink, closeness, hit, cache };

// ---------------------------------------------------------------- event_weather (src/eventweather.js), with the same sponsor line
import { eventWeather, flyRoute, tourRoute, tourNotes } from './eventweather.js';
export async function eventWeatherTool(ctx, args) { return eventWeather(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
export async function flyRouteTool(ctx, args) { return flyRoute(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
export async function tourRouteTool(ctx, args) { return tourRoute(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
export async function tourNotesTool(ctx, args) { return tourNotes(ctx, args, sponsorLine(await sponsorName(ctx.R))); }
/** The sponsor line, for livedot MCP's other tools (writes.js). */
export async function sponsorLineFor(R) { return sponsorLine(await sponsorName(R)); }
