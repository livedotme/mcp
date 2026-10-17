// event_weather: what the weather will be like for an event, for the people taking part. The event comes from livedot's own
// public data: the apps' races coming up (GET /api/profile?upcoming=1, the course from /api/race/<id>), the demo races, and
// livedot's published event previews (src/gen/events.js). Its weather comes from the one engine (WL.legs, WL.timing,
// WL.analyze, WL.verdictOf), timed for the people on it:
//   within the forecast's 10 days: Windline's forecast store (Apple Weather, /api/forecast), as the event pages read it;
//   beyond it: 10 years of ERA5 (/api/historic, the event pages' historic read: every stretch at the hour it's reached),
//   labelled "Based on 10 years of weather on this date".
import { WL } from './gen/engine.js';
import { EVENTS } from './gen/events.js';
import { SITE, DEMOS, getJson } from './reads.js';
import { colourOf, KEY, HEAT_WORDS } from './weather.js';
import { clock } from './words.js';


const HISTORIC = 'https://windline.tech/api/historic';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
const STOP = new Set(['the', 'for', 'at', 'a', 'of', 'race', 'weather', 'this', 'year', 'next', 'what', 'will', 'be', 'like', 'demo', 'marathon']);
const score = (text, q) => { const t = words(text), w = words(q).filter((x) => !STOP.has(x) && !/^\d{4}$/.test(x)); if (!w.length) return 0; const n = w.filter((x) => t.some((y) => y.startsWith(x))).length; return n === w.length ? n : 0; };
/** "about 3 days in 10", as the event pages say a share of days (platform/app/assets/historic.js daysIn10). */
const daysIn10 = (pct) => { const n = Math.round((pct || 0) / 10); return n <= 0 ? 'hardly ever' : n >= 10 ? 'almost every day' : `about ${n} day${n === 1 ? '' : 's'} in 10`; };
const longDate = (ymd) => { const d = new Date(ymd + 'T12:00:00Z'); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
/** A local "YYYY-MM-DD" and "HH:MM" in a time zone → epoch ms. */
function localMs(ymd, hm, tz, off) {
  const [y, mo, d] = ymd.split('-').map(Number), [h, m] = String(hm || '07:00').split(':').map(Number), g = Date.UTC(y, mo - 1, d, h, m);
  if (off != null && !tz) return g - off * 36e5;
  const o = (t) => { const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).forEach((x) => { p[x.type] = x.value; }); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t) / 6e4; };
  return g - o(g - o(g) * 6e4) * 6e4;
}
const triples = (flat) => { const o = []; for (let i = 0; i + 1 < flat.length; i += 3) o.push([flat[i], flat[i + 1], flat[i + 2]]); return o; };

// ---------------------------------------------------------------- finding the event
async function candidates(R, q, year, now) {
  const out = [];
  // livedot's published previews
  for (const e of EVENTS) { const s = score(`${e.name} ${e.event} ${e.slug.replace(/-weather$/, '')}`, q); if (s) out.push({ s: s + 1, kind: 'preview', e }); }
  // the demo races (they run every day): asked for by name with "demo", or when nothing else has that name
  const wantDemo = /\bdemo\b/i.test(q);
  for (const d of DEMOS) { const s = score(d.name + ' ' + d.words.join(' '), q); if (s && (wantDemo || !out.length)) out.push({ s, kind: 'demo', d }); }
  // the apps' races coming up (14 days), on organisers' pages
  const up = await Promise.all(['windline', 'runfast'].map((a) => R.profile(a, 'upcoming=1&limit=200')));
  up.forEach((r, i) => (r.ok && r.body && r.body.events || []).forEach((e) => { const s = score(e.name + ' ' + ((e.organiser && e.organiser.name) || ''), q); if (s) out.push({ s: s + 0.5, kind: 'race', app: e.app || ['windline', 'runfast'][i], e }); }));
  const yr = (c) => (c.kind === 'preview' ? c.e.edition : c.kind === 'race' ? +String(c.e.start || c.e.date || '').slice(0, 4) : new Date(now).getUTCFullYear());
  return out.filter((c) => !year || yr(c) === +year).sort((a, b) => b.s - a.s);
}

/** The days to time, each { name, date, startMs, pts [[lat, lon, ele?]], km }, plus the sport, pace (km/h), tz and the page to link. */
async function plan(R, c, now) {
  if (c.kind === 'preview') {
    const e = c.e, sport = e.sport;
    return { name: e.name, sport, tz: e.tz, url: e.url, timedFor: e.timedFor, app: sport === 'run' ? 'runfast' : 'windline',
      days: e.days.map((d) => { const drawn = WL.route(d.line).total, f = drawn / (d.km || drawn); // the preview's own timing: the line scaled to the official distance (tools/race-week.cjs)
        return { name: d.name, date: d.date, startMs: localMs(d.date, d.start, e.tz, e.utcOffset), pts: d.line, km: d.km, kmh: sport === 'run' ? (60 / e.pace) * f : (e.pace || 20) * f, stops: e.stops || 0 }; }) };
  }
  const app = c.kind === 'demo' ? c.d.app : c.app, id = c.kind === 'demo' ? c.d.id : String(c.e.id).replace(/^run:/, 'run-');
  const r = await R.course(app, id); if (!r.ok || !r.body) return null;
  const b = r.body, sport = app === 'runfast' ? 'run' : 'ride', tz = b.tz || (c.e && c.e.tz) || 'UTC';
  const kmh = sport === 'run' ? 10 : 25; // the follow pages' default plan: 6:00 per km running, 25 km/h riding
  const days = app === 'windline' ? (b.days || []).map((d, i) => ({ name: d.label, date: i ? null : b.date, startMs: i ? null : Date.parse(b.start), pts: triples(d.points), km: null, kmh, stops: 0 })).filter((d) => d.startMs)
    : [{ name: b.name, date: b.date, startMs: Date.parse(b.start), pts: triples(b.course), km: b.km, kmh, stops: 0 }];
  let startMs = days[0] && days[0].startMs;
  if (c.kind === 'demo' && startMs && startMs < now - 6 * 36e5) { const d = Math.ceil((now - startMs) / 864e5); days.forEach((x) => { x.startMs += d * 864e5; }); startMs = days[0].startMs; } // the demo runs every day: its next start
  const url = c.kind === 'demo' ? `${SITE.livedot}/#demo` : (c.e.organiser && c.e.organiser.slug ? `${SITE.livedot}/${c.e.organiser.slug}` : c.e.url);
  return { name: c.kind === 'demo' ? b.name : c.e.name, sport, tz, url, timedFor: sport === 'run' ? 'a runner at 6:00 per km' : 'a rider at 25 km/h', app, days, demo: c.kind === 'demo' };
}

// ---------------------------------------------------------------- the weather for one day
const fcMemo = new Map();
async function forecastDay(R, d, sport, now) {
  const lg = WL.legs(d.pts); if (!lg.length) return null;
  const tm = WL.timing(lg, new Date(d.startMs).toISOString(), d.kmh, d.stops, sport === 'run' ? 'run' : 'ride'), sp = WL.span(tm, now), key = lg.length + '|' + lg[0].lat + ',' + lg[0].lon + '|' + sp.from + sp.to;
  let fetched = null;
  const p = fcMemo.get(key) && now - fcMemo.get(key).at < 30 * 6e4 ? fcMemo.get(key).p : WL.fetchModel(async (q) => {
    const r = await fetch(R.H.forecast + '?' + q, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 300, cacheEverything: true } });
    const f = r.headers.get('x-windline-fetched'); if (r.ok && f) fetched = Date.parse(f);
    let body = null; try { body = await r.json(); } catch (e) { body = null; } return { ok: r.ok, status: r.status, body };
  }, lg, WL.MODELS[0], sp);
  fcMemo.set(key, { at: now, p }); if (fcMemo.size > 100) fcMemo.clear();
  let series; try { series = await p; } catch (e) { fcMemo.delete(key); return null; }
  const a = WL.analyze(lg, tm, { series: { apple: series }, models: ['apple'] }, 'apple');
  return a ? { a, lg, tm, source: 'apple', fetched } : null;
}
async function historicDay(d, sport) {
  const lg = WL.legs(d.pts); if (!lg.length) return null;
  const tm = WL.timing(lg, new Date(d.startMs).toISOString(), d.kmh, d.stops, sport === 'run' ? 'run' : 'ride');
  const pts = lg.map((s, k) => [+s.lat.toFixed(4), +s.lon.toFixed(4), Math.round(tm.etas[k])]);
  let r; try { r = await fetch(HISTORIC, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ points: pts }), signal: AbortSignal.timeout(15000) }); } catch (e) { return null; }
  if (!r.ok) return null; const j = await r.json().catch(() => null); if (!j || !Array.isArray(j.points) || j.points.length !== lg.length) return null;
  const series = j.points.map((p) => ({ times: p.hourly.time || [], ...p.hourly }));
  const a = WL.analyze(lg, tm, { series: { historic: series }, models: ['historic'] }, 'historic');
  const days = j.points.map((p) => p.day).filter(Boolean), avg = (k) => (days.length ? days.reduce((s, x) => s + x[k], 0) / days.length : null);
  return a ? { a, lg, tm, source: 'historic', wet: avg('wet'), hot: avg('hot'), cold: avg('cold'), high: avg('high'), low: avg('low'), credit: j.credit } : null;
}

/** The longest stretches of headwind and tailwind (ride), or the hardest (run): "headwind from km 40 to 62". */
function stretches(w, sport, f) {
  const segs = w.a.segs, out = []; let cur = null;
  const kindOf = (g) => (sport === 'run' ? (g.hard === 'hard' || g.hard === 'veryhard' ? 'hard' : null) : g.effect === 'head' || g.effect === 'tail' ? g.effect : null);
  segs.forEach((g) => { const k = kindOf(g); if (cur && cur.k === k) { cur.to = g.s.toKm; cur.head += g.head * g.s.len; cur.len += g.s.len; } else { if (cur && cur.k) out.push(cur); cur = { k, from: g.s.fromKm, to: g.s.toKm, head: g.head * g.s.len, len: g.s.len }; } });
  if (cur && cur.k) out.push(cur);
  return out.filter((x) => x.len >= 3).sort((a, b) => b.len - a.len).slice(0, 3).sort((a, b) => a.from - b.from)
    .map((x) => (x.k === 'hard' ? `hardest from ${f.atShort(x.from)} to ${f.num(x.to)}` : `${x.k === 'head' ? 'a headwind' : 'a tailwind'} (about ${f.speedShort(Math.abs(x.head / x.len))}) from ${f.atShort(x.from)} to ${f.num(x.to)}`));
}

export async function eventWeather(ctx, args, sponsorLine, plans) {
  const { R, f0, now } = ctx, q = String(args.event || '').trim(), year = args.year ? +args.year : null;
  let P = args._plan || null; // a plan made elsewhere (tour_route: a Windline tour's days)
  if (!P) {
  if (!q) return { text: 'Which event?\n\n' + sponsorLine, structured: { view: 'none' }, map: null };
  const cs = await candidates(R, q, year, now);
  if (!cs.length) {
    const t = `I don't have "${q}"${year ? ' in ' + year : ''} on livedot yet. I can do the weather for events with a livedot page or preview, and for races on Windline and RunFast in the next two weeks. Try "the Comrades demo" or "NYC Marathon".`;
    return { text: t + '\n\n' + sponsorLine, structured: { view: 'none', message: t }, map: null };
  }
  const top = cs.filter((c) => c.s === cs[0].s);
  if (top.length > 1 && !top.every((c) => c.kind === top[0].kind && (c.e || c.d) === (top[0].e || top[0].d))) {
    const names = top.slice(0, 5).map((c) => (c.e ? c.e.name : c.d.name));
    const t = `Several events match "${q}": ${names.join('; ')}. Ask the user which one, then call event_weather with its full name.`;
    return { text: t + '\n\n' + sponsorLine, structured: { view: 'none', events: names }, map: null };
  }
  P = await plan(R, cs[0], now); if (plans) plans.P = P, plans.c = cs[0];
  }
  if (!P || !P.days.length) return { text: 'I couldn\'t read that event\'s course just now. Try again in a moment.\n\n' + sponsorLine, structured: { view: 'none' }, map: null };
  const f = f0(P.tz), sport = P.sport;
  // each day: the forecast inside its 10 days, else 10 years of records
  const days = await Promise.all(P.days.map(async (d) => {
    const fc = !WL.opensAt(new Date(d.startMs).toISOString(), now) && d.startMs > now - 864e5;
    const w = fc ? await forecastDay(R, d, sport, now) : await historicDay(d, sport);
    return { d, w, v: w ? WL.verdictOf(w.a, w.source, f.U) : null };
  }));
  const ok = days.filter((x) => x.w), hist = ok.some((x) => x.w.source === 'historic'), fcst = ok.some((x) => x.w.source === 'apple');
  if (!ok.length) return { text: `I couldn't get the weather for ${P.name} just now. Try again in a moment.\n\n` + sponsorLine, structured: { view: 'none' }, map: null };

  const label = hist && !fcst ? 'Based on 10 years of weather on this date (Copernicus ERA5, 2015–2024), not a forecast.' : fcst && !hist ? 'Forecast from Apple Weather, timed to the course.' : 'The forecast for the days inside 10 days; 10 years of weather on this date for the rest.';
  const lines = [], first = ok[0], d0 = first.d, startLocal = clock(d0.startMs, P.tz, f);
  lines.push(`${P.name}${P.demo ? '' : ''}: ${longDate(new Date(d0.startMs).toLocaleDateString('en-CA', { timeZone: P.tz }))}${P.days.length > 1 ? ` to ${longDate(new Date(P.days[P.days.length - 1].startMs).toLocaleDateString('en-CA', { timeZone: P.tz }))}, ${P.days.length} days` : `, start ${startLocal}`}. ${label}`);
  const S = { view: 'event_weather', event: P.name, sport: sport === 'run' ? 'running' : 'cycling', basis: hist && !fcst ? 'historic' : fcst && !hist ? 'forecast' : 'mixed', timed_for: P.timedFor, url: P.url, units: f.system, days: [] };
  ok.forEach(({ d, w, v }) => {
    const a = w.a, segs = a.segs, t0 = segs[0].w.temp, t1 = segs[segs.length - 1].w.temp, multi = P.days.length > 1;
    let s = multi ? `${d.name} (${longDate(new Date(d.startMs).toLocaleDateString('en-CA', { timeZone: P.tz })).replace(/ \d{4}$/, '')}): ` : '';
    s += `${multi ? 'rated' : 'Rated'} ${WL.RATE[v.rating]}` + (v.why ? ` (${v.why})` : v.plus ? ` (${v.plus})` : '') + '. ';
    s += `About ${f.deg(t0)} at the start and ${f.deg(t1)} at the finish`;
    if (a.minFeels != null && a.minFeels < t0 - 3) s += `, feeling like ${f.deg(a.minFeels)} at ${sport === 'run' ? 'running' : 'riding'} speed`;
    s += '. ';
    const st = stretches(w, sport, f).slice(0, multi ? 1 : 3); if (st.length) s += `${st[0][0].toUpperCase() + st[0].slice(1)}${st.slice(1).map((x) => '; ' + x).join('')}. `;
    if (sport === 'run' && a.heat) s += `Heat stress ${HEAT_WORDS[a.heat]}${a.maxWbgt != null ? ` (WBGT up to ${f.degShort(a.maxWbgt)})` : ''}. `;
    if (w.source === 'historic') s += `Rain on ${daysIn10(w.wet)}; ${f.deg(w.high)} was the usual high.`;
    else s += a.rain >= 0.3 ? `About ${f.U.wet(a.rain)} ${f.U.RAIN} of rain${a.firstRainKm != null ? ' from ' + f.atShort(a.firstRainKm) : ''}.` : a.rainChance != null && a.rainChance >= 30 ? `A ${a.rainChance}% chance of rain.` : 'Dry.';
    lines.push(s.trim());
    S.days.push({ name: d.name, date: new Date(d.startMs).toISOString(), basis: w.source === 'apple' ? 'forecast' : 'historic', rating: v.rating, why: v.why || null, start_temp_c: Math.round(t0), finish_temp_c: Math.round(t1),
      effort_pct: v.effort, ...(sport === 'run' ? { heat_stress: a.heat || null, wbgt_c: a.maxWbgt == null ? null : Math.round(a.maxWbgt) } : {}), ...(w.source === 'historic' ? { rain_days_in_10: Math.round((w.wet || 0) / 10), usual_high_c: Math.round(w.high) } : { rain_mm: +a.rain.toFixed(1) }) });
  });
  if (P.extraLines) P.extraLines.forEach((l) => lines.push(l));
  lines.push(`Timed for ${P.timedFor}.`);
  if (hist) lines.push('Weather records: Copernicus ERA5 (contains modified Copernicus Climate Change Service information).');
  lines.push(`\nMore: ${P.url}`);
  const text = lines.join(' ').replace(/ \nMore:/, '\nMore:') + '\n\n' + sponsorLine;

  // the map: every day's course end to end, coloured by the engine (the wind on a ride, how hard on a run)
  const course = [], stops = []; let total = 0; const per = ok.map((x) => WL.route(x.d.pts).total), all = per.reduce((s, x) => s + x, 0) || 1;
  ok.forEach((x, i) => { const R0 = per[i]; let last = null; x.w.lg.forEach((s) => { const g = x.w.a.segs.find((y) => y.s.id === s.id), c = g ? colourOf(g, sport) : '#8B85FF'; if (c !== last) { stops.push([+((total + s.fromKm) / all).toFixed(4), c]); last = c; } }); total += R0; x.d.pts.forEach((p) => course.push(p)); });
  const thinned = course.length > 700 ? course.filter((p, i) => i % Math.ceil(course.length / 700) === 0 || i === course.length - 1) : course;
  const v0 = first.v, a0 = first.w.a, t0 = a0.segs[0].w.temp, t1 = a0.segs[a0.segs.length - 1].w.temp;
  const map = {
    kind: 'weather', sport, app: P.app, name: P.name, race: hist && !fcst ? 'Based on 10 years of weather on this date' : 'Forecast · Apple Weather', status: hist && !fcst ? 'historic' : 'forecast', statusWord: hist && !fcst ? 'Historic' : 'Forecast',
    course: thinned.map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]), stops, key: KEY[sport], keyTitle: sport === 'run' ? 'How hard the weather makes it' : 'The wind on the road', progress: 0, dot: null,
    headline: `${WL.RATE[v0.rating]}${P.days.length > 1 ? ' on day 1' : ''}`,
    stats: [{ k: P.days.length > 1 ? 'First day' : 'Start', v: clock(first.d.startMs, P.tz, f), sub: new Date(first.d.startMs).toLocaleDateString('en-GB', { timeZone: P.tz, day: 'numeric', month: 'short', year: 'numeric' }) },
      { k: 'Temperature', v: `${f.degShort(t0)} → ${f.degShort(t1)}`, sub: 'start → finish' },
      sport === 'run' ? { k: 'Heat stress', v: a0.heat ? HEAT_WORDS[a0.heat] : '–', sub: a0.maxWbgt != null ? 'WBGT up to ' + f.degShort(a0.maxWbgt) : null, tone: { low: 'good', moderate: 'warn', high: 'bad', extreme: 'bad' }[a0.heat] }
        : { k: 'Wind', v: Math.abs(v0.effort) < 3 ? 'Little effect' : `${Math.abs(v0.effort)}% ${v0.effort < 0 ? 'less' : 'more'} effort`, sub: v0.effort < -2 ? 'mostly behind' : v0.effort > 2 ? 'mostly against' : null, tone: v0.effort <= -3 ? 'good' : v0.effort >= 15 ? 'bad' : v0.effort >= 3 ? 'warn' : null },
      first.w.source === 'historic' ? { k: 'Rain', v: daysIn10(first.w.wet).replace(/^about /, ''), sub: 'on this date' } : { k: 'Rain', v: a0.rain >= 0.3 ? f.U.wet(a0.rain) + ' ' + f.U.RAIN : a0.rainChance != null ? a0.rainChance + '%' : 'Dry', sub: a0.rain >= 0.3 ? 'on the way' : 'chance' }],
    ahead: ok.length > 1 ? ok.slice(0, 8).map((x) => ({ k: x.d.name, v: WL.RATE[x.v.rating], sub: `${f.degShort(x.w.a.segs[0].w.temp)} → ${f.degShort(x.w.a.segs[x.w.a.segs.length - 1].w.temp)}`, c: { good: '#2FA884', fair: '#E8B21E', tough: '#D3344A' }[x.v.rating], at: clock(x.d.startMs, P.tz, f) })) : [],
    aheadTitle: 'Day by day', why: v0.why || v0.plus || null,
    legs: (() => { const L = []; let t = 0; ok.forEach((x, i) => { x.w.a.segs.forEach((g) => L.push([+((t + g.s.fromKm) / all).toFixed(4), +((t + g.s.toKm) / all).toFixed(4), (sport === 'run' ? ({ ideal: 'Ideal', slower: 'A little slower', hard: 'Hard', veryhard: 'Very hard' })[g.hard] || '' : g.effect === 'head' ? 'Headwind ' + f.speedShort(g.head) : g.effect === 'tail' ? 'Tailwind ' + f.speedShort(-g.head) : g.effect === 'calm' ? 'Calm' : 'Side-on ' + f.speedShort(g.w.speed)) + ' · ' + f.degShort(g.w.temp), colourOf(g, sport), f.atShort((t + g.s.fromKm) * ((x.d.km || per[i]) / per[i]))])); t += per[i]; }); return L; })(),
    follow: { url: P.url, label: /livedot\.me/.test(P.url) ? 'Open on livedot' : 'Open the event' },
    updated: hist && !fcst ? 'Copernicus ERA5, 2015–2024 · ' + P.timedFor : (first.w.fetched ? 'Forecast updated ' + Math.max(1, Math.round((now - first.w.fetched) / 6e4)) + ' min ago · ' : '') + 'Apple Weather',
    sponsor: sponsorLine, units: f.system,
  };
  return { text, structured: S, map };
}

/** Where the real Fly the route opens for this event: Windline's Fly page for a Windline race (or the showcase tour whose day 1 is
 *  the Coast Classic demo's course); otherwise the event's own page, which has its map. */
function flyLink(c, P) {
  if (c.kind === 'demo') return c.d.app === 'windline' ? 'https://app.windline.tech/fly?e=tour/pacific-coast-tour&d=1' : `${SITE.runfast}/live/race/${c.d.id}`;
  if (c.kind === 'race' && c.app === 'windline') { const m = String(c.e.url || '').match(/^https:\/\/event\.windline\.tech\/([a-z0-9-]+)/); if (m) return `https://app.windline.tech/fly?e=race/${m[1]}&d=1`; }
  return P.url;
}
/** fly_route: the course from the air, with the weather along it (event_weather's: the forecast within 10 days, history beyond). */
export async function flyRoute(ctx, args, sponsorLine) {
  const holder = {}, out = await eventWeather(ctx, { event: args.event_or_route, year: args.year, units: args.units }, sponsorLine, holder);
  if (!out.map || !holder.P) return out;
  const P = holder.P, fly = flyLink(holder.c, P), f = ctx.f0(P.tz), km = P.days.reduce((s, d) => s + (d.km || WL.route(d.pts).total), 0);
  out.map.kind = 'fly'; out.map.fly = { url: fly, label: 'Fly it in 3D' }; out.map.follow = { url: P.url, label: /livedot\.me/.test(P.url) ? 'Open on livedot' : 'Open the event' };
  out.map.headline = f.dist(km).replace(/ \(.*\)/, '');
  const head = `Here's the ${P.name} course from the air: ${f.dist(km)}${P.days.length > 1 ? ` over ${P.days.length} days` : ''}, with the weather along it. Press play on the map to fly it.`;
  out.text = head + '\n' + out.text.replace(/\nMore:/, `\nFly it in 3D: ${fly}\nMore:`);
  out.structured = { ...out.structured, view: 'fly_route', fly_url: fly, km: Math.round(km * 10) / 10 };
  return out;
}

// ---------------------------------------------------------------- Windline cycling tours: tour_route and tour_notes (beta)
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019]s\b/g, 's').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
/** A published public tour by its name, its address or its organiser's or club's name → { ev (GET /api/event/tour/<slug>), page } or
 *  { list } (several) or null. Only the public reads: the event read, and GET /api/profile (?q= pages, ?slug= their events). */
async function findTour(R, q) {
  const tryEv = async (slug) => { if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(slug)) return null; const r = await R.event('tour', slug); return r.ok && r.body && Array.isArray(r.body.days) ? r.body : null; };
  const m = String(q).match(/tour\.windline\.tech\/([a-z0-9-]+)/i); if (m) { const ev = await tryEv(m[1].toLowerCase()); return ev ? { ev } : null; }
  const direct = await tryEv(slugify(q)); if (direct) return { ev: direct };
  // an organiser's or club's page: its tours (upcoming first, then past), matched on the words that aren't the page's own name
  const words2 = words(q).filter((x) => !STOP.has(x) && x !== 'tour' && x !== 'tours' && x !== 's');
  const pages = await R.profile('windline', 'q=' + encodeURIComponent(words2.join(' ').slice(0, 60) || q)).catch(() => null);
  let found = [];
  const tryPages = async (list) => { for (const pg of list.slice(0, 4)) {
    const r = await R.profile('windline', 'slug=' + encodeURIComponent(pg.slug)), p = r.ok && r.body && r.body.profiles && r.body.profiles[0]; if (!p || !p.events) continue;
    const evs = [...(p.events.live || []), ...(p.events.upcoming || []), ...(p.events.past || [])].filter((e) => e.kind === 'tour');
    const rest = words2.filter((x) => !words(p.name + ' ' + p.slug).some((y) => y.startsWith(x)));
    evs.filter((e) => !rest.length || score(e.name + ' ' + String(e.date || ''), rest.join(' '))).forEach((e) => found.push({ e, page: p }));
  } };
  if (pages && pages.ok && pages.body && pages.body.profiles) await tryPages(pages.body.profiles);
  if (!found.length && words2.length > 1) for (const w of words2) { const r = await R.profile('windline', 'q=' + encodeURIComponent(w)); if (r.ok && r.body && r.body.profiles && r.body.profiles.length) { await tryPages(r.body.profiles); if (found.length) break; } }
  found = found.filter((x, i, a) => a.findIndex((y) => y.e.url === x.e.url) === i);
  if (found.length > 1) { const yr = (words(q).find((x) => /^\d{4}$/.test(x))); const f2 = yr ? found.filter((x) => String(x.e.name + ' ' + (x.e.date || '')).includes(yr)) : found; if (f2.length === 1) found = f2; }
  if (found.length > 1) return { list: found.slice(0, 5).map((x) => `${x.e.name}${x.e.date ? ' (' + x.e.date + ')' : ''}`) };
  if (!found.length) return null;
  const slug = (String(found[0].e.url || '').match(/windline\.tech\/([a-z0-9-]+)\/?$/) || [])[1], ev = slug && await tryEv(slug);
  return ev ? { ev, page: found[0].page } : null;
}
const triplesOf = (pts) => (Array.isArray(pts) ? pts.map((p) => [p[0], p[1], p[2] == null ? null : p[2]]) : []);
const notFound = (q) => `I couldn't find a published Windline tour called "${q}". Try its full name, its address (tour.windline.tech/<name>) or its organiser's name.`;

export async function tourRoute(ctx, args, sponsorLine) {
  const { R, f0 } = ctx, q = String(args.tour || '').trim();
  if (!q) return { text: 'Which tour?\n\n' + sponsorLine, structured: { view: 'none' }, map: null };
  const t = await findTour(R, q);
  if (!t) return { text: notFound(q) + '\n\n' + sponsorLine, structured: { view: 'none' }, map: null };
  if (t.list) { const x = `Several tours match "${q}": ${t.list.join('; ')}. Ask the user which one.`; return { text: x + '\n\n' + sponsorLine, structured: { view: 'none', tours: t.list }, map: null }; }
  const ev = t.ev, f = f0(ev.tz), days = ev.days.filter((d) => d.points && d.points.length > 1 && d.start);
  const dayLine = (d) => `${d.label || 'Day'}: ${[d.from, d.to].filter(Boolean).join(' to ')}, ${f.dist(d.km)}${d.climb ? `, ${f.U.height(d.climb).toLocaleString('en-GB')} ${f.U.HEIGHT} of climbing` : ''}, start ${clock(Date.parse(d.start), ev.tz, f)}.`;
  // route files: one GPX link a day (Windline's GET /api/event/tour/<slug>/day/<n>.gpx: the tour page's own file), only while the
  // organiser's route-download switch is on; the server refuses them otherwise, and so does this answer
  const gpxOf = (i) => `https://windline.tech/api/event/${ev.type || 'tour'}/${ev.slug}/day/${i + 1}.gpx`;
  const files = ev.routeFiles === true
    ? 'Route files (GPX), one a day:\n' + days.map((d) => `- ${d.label || 'Day'}: ${gpxOf(ev.days.indexOf(d))}`).join('\n') + `\nGarmin .fit files: the Route button on the tour page, ${ev.url}`
    : 'The organiser hasn\'t made the route files available.';
  const P = { name: ev.name, sport: 'ride', tz: ev.tz, url: ev.url, app: 'windline', timedFor: `the organiser's plan (${f.speedShort((days[0] && days[0].pace) || ev.pace || 25)}${ev.stops ? ', ' + ev.stops + ' min of stops a day' : ''})`,
    days: days.map((d) => ({ name: d.label || [d.from, d.to].join(' to '), date: d.start.slice(0, 10), startMs: Date.parse(d.start), pts: triplesOf(d.points), km: d.km, kmh: d.pace || ev.pace || 25, stops: d.stops ?? ev.stops ?? 0 })),
    extraLines: [] };
  const out = await eventWeather(ctx, { event: ev.name, units: args.units, _plan: P }, sponsorLine);
  const head = `${ev.name}: ${days.length} day${days.length === 1 ? '' : 's'}, ${f.dist(days.reduce((s, d) => s + (d.km || 0), 0))}${t.page ? ', by ' + t.page.name : ''}.\n` + days.map(dayLine).join('\n') + '\n' + files + '\n\nThe weather:';
  out.text = head + ' ' + out.text.replace(/\nMore:.*$/m, `\nTour page: ${ev.url}`);
  out.structured = { ...out.structured, view: 'tour_route', tour: ev.name, url: ev.url, route_files: ev.routeFiles === true, gpx: ev.routeFiles === true ? days.map((d) => ({ day: d.label, url: gpxOf(ev.days.indexOf(d)) })) : [],
    days: days.map((d, i) => ({ ...(out.structured.days && out.structured.days[i] || {}), label: d.label, from: d.from, to: d.to, km: d.km, climb_m: d.climb, start: d.start })) };
  if (out.map) { out.map.follow = { url: ev.url, label: 'Open the tour' }; if (ev.routeFiles === true && days.length) out.map.fly = { url: gpxOf(ev.days.indexOf(days[0])), label: days.length > 1 ? 'Day 1 GPX' : 'Download the GPX' }; if (ev.routeFiles !== true) out.map.updated = 'The organiser hasn\'t made the route files available. · ' + out.map.updated; out.map.ahead = days.slice(0, 8).map((d, i) => ({ ...(out.map.ahead[i] || {}), url: ev.routeFiles === true ? gpxOf(ev.days.indexOf(d)) : null, k: (d.label || 'Day ' + (i + 1)) + ' · ' + [d.from, d.to].filter(Boolean).join(' → '), sub: f.dist(d.km).replace(/ \(.*\)/, '') + (d.climb ? ' · ' + f.U.height(d.climb).toLocaleString('en-GB') + ' ' + f.U.HEIGHT + ' up' : '') + (out.map.ahead[i] ? ' · ' + out.map.ahead[i].sub : '') })); }
  return out;
}

/** tour_notes (beta): the organiser's own notes for a tour (the tour's public data, `notes`), as their words. */
export async function tourNotes(ctx, args, sponsorLine) {
  const { R } = ctx, q = String(args.tour || '').trim();
  const t = q ? await findTour(R, q) : null;
  if (!t) return { text: notFound(q) + '\n\n' + sponsorLine, structured: { view: 'none' }, map: null };
  if (t.list) { const x = `Several tours match "${q}": ${t.list.join('; ')}. Ask the user which one.`; return { text: x + '\n\n' + sponsorLine, structured: { view: 'none', tours: t.list }, map: null }; }
  const ev = t.ev, notes = typeof ev.notes === 'string' ? ev.notes.trim().slice(0, 6000) : '';
  if (!notes) { const x = `The organiser of ${ev.name} hasn't written any notes for riders yet. The tour page: ${ev.url}`; return { text: x + '\n\n' + sponsorLine, structured: { view: 'tour_notes', tour: ev.name, notes: null, url: ev.url }, map: null }; }
  const upd = Number(ev.notesUpdatedAt) > 0 ? new Date(Number(ev.notesUpdatedAt)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ev.tz || 'UTC' }) : null;
  const text = `${ev.name}: the organiser's notes for riders (beta), in their own words${upd ? ', last updated ' + upd : ''}. Quote and summarise only these; never add to them, and say so if they don't cover the question.\n\n` + notes.split('\n').map((l) => '> ' + l).join('\n') + `\n\nTour page: ${ev.url}\n\n${sponsorLine}`;
  return { text, structured: { view: 'tour_notes', beta: true, tour: ev.name, notes, notes_updated: upd ? new Date(Number(ev.notesUpdatedAt)).toISOString() : null, url: ev.url, sponsor_line: sponsorLine }, map: null };
}
