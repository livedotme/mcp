// The weather where someone is, and along the road ahead: the one forecast engine (Windline's windlineEngine(), src/gen/engine.js),
// run exactly as the two follow pages run it (windline.tech/live wxOf, runfast.tech/live heatOf): the course's stretches (legs),
// their plan re-timed so they reach where they are when they were there (retime), one forecast read for the course from Windline's
// store (Apple Weather, fetchModel), then analyze. Nothing here computes weather: every number is the engine's.
import { WL } from './gen/engine.js';

const memo = new Map(); // course key → { at, p, fetched }: one forecast read per course and span, shared by every ask, for 30 minutes

/** A course from /api/race/<id> as [[lat, lon, ele], …] for one day: Windline's days (the rider's day, or the only one), RunFast's course. */
export function coursePoints(app, body, dayId) {
  if (!body) return null;
  if (app === 'windline') {
    const days = body.days || [], d = days.find((x) => String(x.id) === String(dayId)) || (days.length === 1 ? days[0] : null);
    if (!d) return null;
    return { id: d.id, pts: triples(d.points), km: body.km };
  }
  return { id: body.id, pts: triples(body.course), km: body.km };
}
function triples(flat) {
  const out = []; if (!Array.isArray(flat)) return out;
  if (Array.isArray(flat[0])) return flat.map((p) => [p[0], p[1], p[2] == null ? null : p[2]]);
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out;
}

/** The speed the engine times the rest at, as each follow page does: a rider's speed now, else the plan's (10–40 km/h, Windline
 *  kmhOf); a runner's planned pace (RunFast heatOf). */
export function kmhOf(app, v) {
  if (app === 'windline') { const s = v.speed > 0 ? v.speed : v.plan && v.plan.speed > 0 ? v.plan.speed : 25; return Math.min(40, Math.max(10, s)); }
  return 3600 / ((v.plan && v.plan.pace) || 360);
}
/** Where they are on the course's own distance (the follow pages' scaling of the feed's km to the course's). */
function courseKm(app, v, R, c) {
  return app === 'windline' ? v.km * (R.total / (v.total || R.total)) : v.km * (R.total / (c.km || R.total));
}
/** The plan, moved in time so they reach where they are when they were there (both follow pages' retime). */
function retime(lg, km, kmh, at, sport) {
  const t0 = WL.timing(lg, new Date(0).toISOString(), kmh, 0, sport); let off = 0;
  for (let k = 0; k < lg.length; k++) { if (km >= lg[k].toKm) { off += t0.durs[k]; continue; } off += t0.durs[k] * Math.max(0, (km - lg[k].fromKm) / Math.max(lg[k].len, 1e-6)); break; }
  return WL.timing(lg, new Date(at - off * 1000).toISOString(), kmh, 0, sport);
}

/**
 * The weather for one person on a course: { a (the engine's analysis), x (the stretch they're on), ahead (the next stretches),
 * verdict (the engine's rating of the road ahead), km (on the course), R, lg, fetched } or null when there's no forecast.
 */
export async function weatherFor({ app, v, course, forecastUrl, now = Date.now(), aheadKm }) {
  if (!course || course.pts.length < 2 || !(v.km >= 0)) return null;
  const sport = app === 'runfast' ? 'run' : 'ride', R = WL.route(course.pts), lg = WL.legs(course.pts); if (!lg.length) return null;
  const km = courseKm(app, v, R, course), at = v.last && v.last.t ? v.last.t : now;
  const tm = retime(lg, km, kmhOf(app, v), at, sport), sp = WL.span(tm, now), key = app + '|' + course.id + '|' + sp.from + '|' + sp.to;
  let e = memo.get(key);
  if (!e || now - e.at > 30 * 6e4) {
    e = { at: now, fetched: null };
    e.p = WL.fetchModel(async (q) => {
      const r = await fetch(forecastUrl + '?' + q, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 300, cacheEverything: true } });
      const f = r.headers.get('x-windline-fetched'); if (r.ok && f) { const t = Date.parse(f); if (isFinite(t) && (!e.fetched || t < e.fetched)) e.fetched = t; }
      let body = null; try { body = await r.json(); } catch (err) { body = null; }
      return { ok: r.ok, status: r.status, body };
    }, lg, WL.MODELS[0], sp);
    e.p.catch(() => { memo.delete(key); }); // no forecast: asked again next time
    if (memo.size > 200) memo.clear();
    memo.set(key, e);
  }
  let series; try { series = await e.p; } catch (err) { return null; }
  const data = { series: { apple: series }, models: ['apple'] }, a = WL.analyze(lg, tm, data, 'apple');
  if (!a || !a.segs || !a.segs.length) return null;
  const x = a.segs.find((g) => km <= g.s.toKm + 1e-6) || a.segs[a.segs.length - 1];
  const reach = aheadKm || (sport === 'run' ? 10 : 30);
  const ahead = a.segs.filter((g) => g.s.toKm > km + 0.05 && g.s.fromKm < km + reach);
  // the engine's rating of the road ahead: its own analysis of the stretches still to come (the next 10 km running, 30 km riding)
  let verdict = null, i = lg.findIndex((s) => s.toKm > km + 0.05);
  if (i >= 0) {
    const j = Math.max(i + 1, lg.findIndex((s) => s.fromKm >= km + reach)), end = j > i ? j : lg.length, sub = lg.slice(i, end);
    const stm = { ...tm, durs: tm.durs.slice(i, end), rides: tm.rides.slice(i, end), etas: tm.etas.slice(i, end), total: sub[sub.length - 1].toKm - sub[0].fromKm };
    const a2 = WL.analyze(sub, stm, { series: { apple: series.slice(i, end) }, models: ['apple'] }, 'apple');
    if (a2) verdict = { a: a2, fromKm: sub[0].fromKm, toKm: sub[sub.length - 1].toKm };
  }
  return { a, x, ahead, verdict, km, R, lg, sport, fetched: e.fetched || null };
}

// The colours both follow pages paint a course in: Fly the route's wind colours on a ride (windline.tech/live colOf), the engine's
// how-hard levels on a run (runfast.tech/live paintCourse).
const WC = { tailS: '#00E0A4', tail: '#3CF2C8', neutral: '#D6DEE8', head: '#FF9A2E', headS: '#FF3B5C' };
const RC = { ideal: '#2FA884', slower: '#E8B21E', hard: '#EE7A1F', veryhard: '#D3344A' };
export function colourOf(g, sport) {
  if (sport === 'run') return RC[g.hard] || RC.ideal;
  return g.effect === 'tail' ? (-g.head >= 15 ? WC.tailS : WC.tail) : g.effect === 'head' ? (g.head >= 15 ? WC.headS : WC.head) : WC.neutral;
}
export const KEY = {
  ride: [[WC.tailS, 'Strong tailwind'], [WC.tail, 'Tailwind'], [WC.neutral, 'Side-on or calm'], [WC.head, 'Headwind'], [WC.headS, 'Strong headwind']],
  run: [[RC.ideal, 'Ideal'], [RC.slower, 'A little slower'], [RC.hard, 'Hard'], [RC.veryhard, 'Very hard']],
};
export const HARD_WORDS = { ideal: 'ideal', slower: 'a little slower', hard: 'hard', veryhard: 'very hard' };
export const HEAT_WORDS = { low: 'Low', moderate: 'Moderate', high: 'High', extreme: 'Extreme' };
