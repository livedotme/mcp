// livedot MCP: several GPX files → one tour, worked out the way an organiser would (Wes, 17 Oct: "if I drag in five GPXs named 1, 2,
// 3, 4, it works out it's a tour"). Shared by create_event (the draft) and plan_route (the weather), so both see the same days.
//   order   1. the numbers in the file names or the GPX <name> (1, 01, "day-2", "Stage 3", "D4"), when every file has its own;
//           2. else the map: each day starts where the one before ended (the dashboard's routeOrder, gpx.js, unchanged);
//           3. else the order they came in. When the numbers and the map disagree, one line says so and the numbers win.
//   days    "From → To" from the route's own name (Windline's reader, gpxroute.js), else the towns at its ends (Photon, OpenStreetMap
//           data, as the dashboard's placeName's second service: only the two end points, rounded to about 100 m, are sent); km and climbing from the
//           reader (points thinned as the dashboard does); one day after another from the first start, same time, rest days skipped.
//   name    what the user called it, else the GPX files' shared name ("Garden Route Classic - Day 1" → "Garden Route Classic"),
//           else "Mossel Bay → Storms River, 4 days".
import { readRoutes, toIso, okTz, zoneAt, Plain } from './writes.js';

export const MAX_FILES = 30;
const rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => { const p1 = rad(a[0]), p2 = rad(b[0]), dp = p2 - p1, dl = rad(b[1] - a[1]); const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))); };

/** The day number a file or route name gives: "day-2", "Stage 3", "D4", "01", "1.gpx"; null when there's none (never a year). */
export function dayNumber(raw) {
  const s = String(raw || '').replace(/\.(gpx|xml|fit|tcx)$/i, '').replace(/[_]+/g, ' ');
  const k = /(?:^|[^a-z])(?:day|stage|etappe|dag|leg|part|d)\s*[-#.:]?\s*0*(\d{1,2})(?!\d)/i.exec(s);
  if (k) return +k[1];
  const n = /(?:^|[^0-9a-z])0*(\d{1,2})(?=$|[^0-9a-z])/i.exec(s);
  return n ? +n[1] : null;
}

// ---- the dashboard's routeOrder (platform/app/assets/gpx.js), unchanged: try every day first, follow on to the nearest start
const gapKm = (list) => list.reduce((s, d, i) => (i ? s + dist(list[i - 1].pts[list[i - 1].pts.length - 1], d.pts[0]) : s), 0);
export function routeOrder(items) {
  if (items.length < 2 || items.some((d) => !d.pts || d.pts.length < 2)) return { order: items.slice(), changed: false, gap: 0, was: 0 };
  let best = null;
  for (const head of items.keys()) {
    const left = new Set(items.keys()), order = [items[head]];
    left.delete(head);
    while (left.size) {
      const at = order[order.length - 1].pts[order[order.length - 1].pts.length - 1];
      let j = -1, dj = Infinity;
      for (const i of left) { const g = dist(at, items[i].pts[0]); if (g < dj) { dj = g; j = i; } }
      order.push(items[j]); left.delete(j);
    }
    const gap = gapKm(order);
    if (!best || gap < best.gap) best = { order, gap };
  }
  const was = gapKm(items);
  const changed = best.gap < was - 5 && best.order.some((d, i) => d !== items[i]);
  return { order: changed ? best.order : items.slice(), changed, gap: best.gap, was };
}

// ---- the town at a point (Photon on OpenStreetMap, gpx.js placeName's second service: free, no key; its first is for browsers only)
const placeMemo = new Map();
const okPlace = (v) => (v && typeof v === 'string' && !/municipality|ward|district|region|county|province|^\d/i.test(v) && v.length <= 32 ? v.trim() : '');
export async function placeName(lat, lon) {
  const k = `${(+lat).toFixed(3)},${(+lon).toFixed(3)}`; // about 100 m: the town, never the house
  if (placeMemo.has(k)) return placeMemo.get(k);
  const [a, b] = k.split(',');
  let name = '';
  try {
    // the nearest town, city or village within 20 km (Photon's own city field is often the municipality: "George" for Knysna)
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${a}&lon=${b}&limit=1&lang=en&radius=20&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village`, { headers: { Accept: 'application/json', 'User-Agent': 'livedot-mcp (https://livedot.me/mcp)' }, signal: AbortSignal.timeout(3500) });
    const j = r.ok ? await r.json() : null, q = (j && j.features && j.features[0] && j.features[0].properties) || {};
    name = okPlace(q.name) || '';
  } catch (e) { name = ''; }
  if (placeMemo.size > 500) placeMemo.clear();
  placeMemo.set(k, name);
  return name;
}

// ---- dates
const ymdAdd = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const START = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/;

/** The files' shared name, if they have one: "Garden Route Classic - Day 1", "… - Day 2" → "Garden Route Classic". */
function sharedName(names) {
  const base = names.map((n) => String(n || '').replace(/[_]+/g, ' ').replace(/(?:^|[\s\-–—:·|,(])(?:day|stage|etappe|dag|leg|part|d)\s*[-#.:]?\s*\d{1,2}\b.*$/i, '').replace(/[\s\-–—:·|,(]+$/, '').trim());
  const good = (x) => (/[a-z]{3}/i.test(x) && x.length <= 80 ? x : '');
  if (base.length && base.every((x) => x && x === base[0])) return good(base[0]);
  // else the words they all start with, up to a separator: "Garden Route Classic - Coast", "… - Lakes" → "Garden Route Classic"
  const all = names.map((x) => String(x || '').trim()); if (all.length < 2 || all.some((x) => !x)) return '';
  let pre = all[0]; for (const x of all) while (!x.startsWith(pre)) pre = pre.slice(0, -1);
  const cut = pre.search(/\s*[-–—:·|,(]\s*[^-–—:·|,(]*$/); if (cut < 0 || pre.length === all[0].length) return '';
  return all.every((x) => /^\s*[-–—:·|,(]/.test(x.slice(cut))) ? good(pre.slice(0, cut).trim()) : '';
}

/**
 * files: [{ gpx | url | download_url, name? (the file's name) }]. opts: { start: "YYYY-MM-DD HH:MM" (day 1), tz?, starts?: [per day],
 * rest_days?: ["YYYY-MM-DD"], name?, needStart? (false for a plan without dates yet) }.
 * → { name, tz, days: [{ n, file, label, name, from, to, km, climb, pts, start }], order: 'numbers'|'map'|'upload', note, lines }
 */
export async function planTour(ctx, files, opts = {}) {
  const list = (Array.isArray(files) ? files : []).filter((f) => f && typeof f === 'object');
  if (!list.length) throw new Plain('Attach the GPX files, or give links to them.');
  if (list.length > MAX_FILES) throw new Plain(`That's ${list.length} files: a tour can have up to ${MAX_FILES} days.`);
  // read every file (Windline's reader: trk or rte, every segment, thinned as the dashboard does); say which ones fail and why
  const got = await Promise.all(list.map(async (f, i) => {
    const label = String(f.name || f.filename || '').trim().slice(0, 80) || `File ${i + 1}`;
    const src = f.gpx ? { gpx: f.gpx } : f.url ? { url: f.url } : f.download_url ? { url: f.download_url } : null;
    if (!src) return { label, err: `${label} has no GPX in it (attach the file, or give its link).` };
    try { return { label, routes: await readRoutes(ctx, src) }; }
    catch (e) { return { label, err: String(e.message || 'couldn’t be read.').replace(/^(That file|That link’s GPX|That route|That link)\b/, label) }; }
  }));
  const bad = got.filter((g) => g.err);
  if (bad.length) throw new Plain(`${bad.map((b) => (b.err.startsWith(b.label) ? b.err : `${b.label}: ${b.err}`)).join(' ')} Fix ${bad.length === 1 ? 'it' : 'them'} or leave ${bad.length === 1 ? 'it' : 'them'} out, then try again.`);
  let items = [];
  got.forEach((g, i) => g.routes.forEach((r, j) => items.push({ idx: items.length, file: g.label, gname: r.name || '', from: r.from || '', to: r.to || '', km: r.km, climb: r.climb, pts: r.pts,
    n: g.routes.length > 1 ? null : dayNumber(list[i].name || list[i].filename) ?? dayNumber(r.name) })));
  if (items.length > MAX_FILES) throw new Plain(`That's ${items.length} routes: a tour can have up to ${MAX_FILES} days.`);

  // the order: the numbers, else the map, else as they came
  let order = 'upload', note = null;
  const numbered = items.length > 1 && items.every((x) => x.n != null) && new Set(items.map((x) => x.n)).size === items.length;
  if (numbered) {
    items = items.slice().sort((a, b) => a.n - b.n); order = 'numbers';
    const geo = routeOrder(items);
    if (geo.changed) { // the map would join the days up better: say so, keep the numbers
      const k = items.findIndex((d, i) => i && dist(items[i - 1].pts[items[i - 1].pts.length - 1], d.pts[0]) > 5);
      const gap = k > 0 ? Math.round(dist(items[k - 1].pts[items[k - 1].pts.length - 1], items[k].pts[0])) : null;
      note = `The file numbers and the map disagree${k > 0 ? ` (by number, day ${k + 1} starts ${gap} km from where day ${k} ends)` : ''}; I kept the numbers’ order. By the map it would be ${geo.order.map((d) => d.file).join(', ')}.`;
    }
  } else if (items.length > 1) {
    const geo = routeOrder(items);
    if (geo.changed) { items = geo.order; order = 'map'; }
    if (items.some((x) => x.n != null) && !items.every((x) => x.n != null)) note = 'Only some files have day numbers, so I went by the map.';
  }

  // the towns at each end, where the route's own name doesn't give them: one lookup per place (a day's finish is the next day's
  // start), two at a time (Photon is a free, shared service), each tried twice
  const ends = [];
  items.forEach((d) => { const a = d.pts[0], b = d.pts[d.pts.length - 1]; d.loop = dist(a, b) < 1.5; if (!d.from) ends.push(a); if (!d.to && !d.loop) ends.push(b); });
  const uniq = []; ends.forEach((p) => { if (!uniq.some((q) => dist(p, q) < 1)) uniq.push(p); });
  const found = new Map(), queue = uniq.slice();
  await Promise.all([0, 1].map(async () => { for (let p = queue.shift(); p; p = queue.shift()) { let nm = await placeName(p[0], p[1]); if (!nm) { await new Promise((ok) => setTimeout(ok, 400)); placeMemo.delete(`${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`); nm = await placeName(p[0], p[1]); } found.set(p, nm); } }));
  const townAt = (p) => { for (const [q, nm] of found) if (dist(p, q) < 1) return nm; return ''; };
  items.forEach((d) => { if (!d.from) d.from = townAt(d.pts[0]); if (!d.to) d.to = d.loop ? d.from : townAt(d.pts[d.pts.length - 1]); });

  // when: one day after the other from the first start, the same time each day, rest days skipped
  const tz = okTz(opts.tz) ? opts.tz : zoneAt(items[0].pts[0]) || 'UTC';
  const starts = Array.isArray(opts.starts) ? opts.starts : [];
  const rest = new Set((Array.isArray(opts.rest_days) ? opts.rest_days : []).map(String).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)));
  const first = String(opts.start || starts[0] || '').trim(), m = START.exec(first);
  if (!m && opts.needStart !== false) throw new Plain(/^\d{4}-\d{2}-\d{2}$/.test(first) ? 'What time does each day start? Give the first day as "YYYY-MM-DD HH:MM".' : 'When does day 1 start? Give a date and time, "YYYY-MM-DD HH:MM".');
  let date = m ? m[1] : null;
  const days = items.map((d, i) => {
    let start = null;
    if (starts[i] && i > 0) start = toIso(starts[i], tz);
    if (!start && date) { while (rest.has(date)) date = ymdAdd(date, 1); start = toIso(`${date} ${m[2]}`, tz); date = ymdAdd(date, 1); }
    return { n: i + 1, file: d.file, label: items.length > 1 ? `Day ${i + 1}` : '', name: d.gname, from: d.from, to: d.to, km: d.km, climb: d.climb, pts: d.pts, start };
  });
  const multi = days.length > 1, A = days[0], Z = days[days.length - 1];
  const name = String(opts.name || '').trim().slice(0, 120) || sharedName(days.map((d) => d.name)) || (A.from && Z.to ? `${A.from} → ${Z.to}${multi ? `, ${days.length} days` : ''}` : (A.name || (multi ? `A ${days.length}-day tour` : 'My route')));
  const why = { numbers: 'in the order of the numbers in the file names', map: 'by the map: each day starts where the one before ended', upload: 'in the order the files came' }[order];
  return { name, tz, days, order, why: multi ? why : null, note };
}

/** The plan in a few lines, for the user to check before anything is made. f: the units formatter; clock: words.js clock. */
export function planLines(plan, f, clock) {
  const imp = f.system === 'imperial', climb = (m) => `${Math.round(imp ? m * 3.28084 : m).toLocaleString('en-US')} ${imp ? 'ft' : 'm'}`;
  const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { timeZone: plan.tz, weekday: 'short', day: 'numeric', month: 'short' });
  const km = plan.days.reduce((s, d) => s + (d.km || 0), 0), up = plan.days.reduce((s, d) => s + (d.climb || 0), 0);
  const n = plan.days.length, head = `${plan.name}: ${n > 1 && !plan.name.endsWith(`${n} days`) ? `${n} days, ` : ''}${f.num(km)} ${f.label.dist}, ${climb(up)} up${plan.days[0].start ? `, from ${day(plan.days[0].start)}` : ''}.${plan.why ? ` Days ${plan.why}.` : ''}`;
  const rows = plan.days.map((d) => `${d.label ? d.label + ' · ' : ''}${d.start ? `${day(d.start)} ${clock(Date.parse(d.start), plan.tz, f)} · ` : ''}${[d.from, d.to].filter(Boolean).join(' → ') || d.name || 'Route'} · ${f.num(d.km)} ${f.label.dist}, ${climb(d.climb || 0)} up (${d.file})`);
  return [head, ...rows, ...(plan.note ? [plan.note] : [])];
}
