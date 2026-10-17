// livedot MCP's tools for organisers and club admins: plan_route (no account), and with a signed-in Windline or RunFast account
// (OAuth 2.1, the account's own permissions): list_my_events, create_event, update_event, add_tour_notes, publish_event,
// post_club_ride. livedot.me holds no account data: every write is done by the app's own server (windline.tech/api/mcp/tool/*,
// which hands a RunFast account's to runfast.tech), with the person's token. handoffs/2026-10-17-mcp-oauth-contract.md (Windline repo).
import tzlookup from './gen/tzlookup.js';
import { eventWeather } from './eventweather.js';
import { clock } from './words.js';

export const RESOURCE_META = 'https://livedot.me/.well-known/oauth-protected-resource/mcp';
export const SCOPE = { list_my_events: 'events.read', create_event: 'events.write', update_event: 'events.write', add_tour_notes: 'events.write', publish_event: 'events.publish', post_club_ride: 'clubs.post' };

/** Ask for a sign-in: the MCP server answers 401 (or, for ChatGPT, a result that starts its sign-in). */
export class NeedAuth extends Error { constructor(scope, error) { super('Sign in to your Windline or RunFast account to do this.'); this.scope = scope; this.error = error || null; } }

const UNITS = { type: 'string', enum: ['metric', 'imperial'], description: 'Pass the asker\'s units: imperial for users in the US, UK road distances, Liberia or Myanmar, or when they ask in miles/°F; otherwise metric.' };
const ROUTE = {
  gpx: { type: 'string', description: 'The GPX file\'s text, if the user pasted or attached it (up to 5 MB).' },
  url: { type: 'string', description: 'A link to the route: a Ride with GPS route, ride or collection (a collection gives one day per route), or any public link to a GPX file. Not Strava.' },
};
const DAY = { type: 'object', properties: { ...ROUTE, start: { type: 'string', description: 'Local start, "YYYY-MM-DD HH:MM" in the route\'s own time zone.' }, label: { type: 'string', description: 'e.g. "Day 1", "Stage 2".' } }, additionalProperties: false };
const auth = (scope) => [{ type: 'oauth2', scopes: [scope] }];
const ann = (title, x) => ({ title, readOnlyHint: false, openWorldHint: true, idempotentHint: false, destructiveHint: false, ...x });

export const WRITE_TOOLS = [
  {
    name: 'plan_route',
    title: 'Weather along your route',
    description: 'The weather along a route at the time you\'d ride or run it, from a GPX file or a link (Ride with GPS, or any GPX link): the forecast within 10 days, 10 years of weather on that date beyond it, rated by Windline\'s forecast engine, with the headwind and tailwind stretches, heat and rain, and a map. No account needed. For "What will the wind be like on this route on Saturday at 6?".',
    inputSchema: { type: 'object', properties: { ...ROUTE, gpx_file: { type: 'object', description: 'An attached GPX file (ChatGPT).', properties: { download_url: { type: 'string' }, file_id: { type: 'string' } } },
      start: { type: 'string', description: 'When they start, "YYYY-MM-DD HH:MM" local to the route. Ask if they didn\'t say.' }, tz: { type: 'string', description: 'The route\'s IANA time zone, if known (else worked out from where it starts).' },
      sport: { type: 'string', enum: ['ride', 'run'], description: 'ride (default) or run.' }, pace: { type: 'number', description: 'Riding speed in km/h (default 25), or running pace in minutes per km (default 6).' }, units: UNITS },
      required: ['start'], additionalProperties: false },
    annotations: { title: 'Weather along your route', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    securitySchemes: [{ type: 'noauth' }],
  },
  {
    name: 'list_my_events',
    title: 'My events',
    description: 'The signed-in organiser\'s own events on Windline (rides, tours, races) or RunFast (runs, races, and their clubs\' runs): each with its id, status (draft or published), dates, distance, whether it\'s finished, and its dashboard and public links. Use it to find an event id before changing one.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'My events', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    securitySchemes: auth('events.read'),
  },
  {
    name: 'create_event',
    title: 'Create a draft event',
    description: 'Create a DRAFT event in the signed-in account from GPX routes or links: a cycling ride, tour or race (Windline account) or a run or running race (RunFast account). It is not public until publish_event. Each day needs its route and its local start ("YYYY-MM-DD HH:MM"). Confirm the name, dates and times with the user before creating. Returns the dashboard link.',
    inputSchema: { type: 'object', properties: {
      type: { type: 'string', enum: ['ride', 'tour', 'race', 'run'], description: 'ride, tour or race on Windline (cycling); run on RunFast (a running race: type run with race: true).' },
      name: { type: 'string', description: 'The event\'s name.' }, race: { type: 'boolean', description: 'RunFast: a race (once, with a gun time) rather than a run.' },
      days: { type: 'array', items: DAY, description: 'One per day (a ride or a run: one). Or give url with a Ride with GPS collection and starts.' },
      url: { type: 'string', description: 'A Ride with GPS collection for a multi-day tour (one day per route), used with starts.' },
      starts: { type: 'array', items: { type: 'string' }, description: 'With url: each day\'s local start, "YYYY-MM-DD HH:MM".' },
      weekly: { type: 'object', description: 'A weekly ride or run: { days: [0-6, Sunday is 0], time: "HH:MM" }.', properties: { days: { type: 'array', items: { type: 'integer' } }, time: { type: 'string' } } },
      tz: { type: 'string', description: 'IANA time zone; else worked out from where the route starts.' },
      description: { type: 'string', description: 'What the event is, for its public page.' }, notes: { type: 'string', description: 'Tours: notes for riders (what to pack, meeting points). RunFast: a short note (600 characters).' },
      place: { type: 'string', description: 'RunFast: where it starts, in words.' }, pace: { type: 'number', description: 'Riding km/h, or running seconds per km.' },
      page: { type: 'string', description: 'Windline: the club or organiser page address to show it on (one they run).' }, club: { type: 'string', description: 'RunFast: the club address (one they manage).' } },
      required: ['type', 'name'], additionalProperties: false },
    annotations: ann('Create a draft event', { destructiveHint: false }),
    securitySchemes: auth('events.write'),
  },
  {
    name: 'update_event',
    title: 'Change an event',
    description: 'Change one of the signed-in organiser\'s events: its name, description or notes, or start dates and times. Never a finished event (finished events stay as they were). Tell the user exactly what will change and get a yes first.',
    inputSchema: { type: 'object', properties: { event_id: { type: 'string', description: 'From list_my_events.' }, name: { type: 'string', description: 'A new name.' }, description: { type: 'string', description: 'A new description for its public page.' }, notes: { type: 'string', description: 'RunFast runs only (tours: add_tour_notes).' }, place: { type: 'string', description: 'RunFast: where it starts, in words.' },
      days: { type: 'array', description: 'Windline tours and races: [{ day: 2, date?: "YYYY-MM-DD", time?: "HH:MM" }].', items: { type: 'object', properties: { day: { type: 'integer' }, date: { type: 'string' }, time: { type: 'string' } } } },
      date: { type: 'string', description: 'A one-off ride or run: its new date, YYYY-MM-DD.' }, time: { type: 'string', description: 'A ride or run: its new start time, HH:MM.' } },
      required: ['event_id'], additionalProperties: false },
    annotations: ann('Change an event', { destructiveHint: true }),
    securitySchemes: auth('events.write'),
  },
  {
    name: 'add_tour_notes',
    title: 'Write a tour\'s notes for riders',
    description: 'Set or add to a Windline cycling tour\'s notes for riders (what to pack, how the tour runs, meeting points; markdown, up to 10,000 characters), shown on the tour\'s page. Never a finished tour. Show the user the notes and get a yes first.',
    inputSchema: { type: 'object', properties: { event_id: { type: 'string', description: 'The tour\'s id, from list_my_events.' }, notes: { type: 'string', description: 'The notes for riders, in markdown (up to 10,000 characters).' }, mode: { type: 'string', enum: ['replace', 'append'], description: 'replace (default) or append.' } }, required: ['event_id', 'notes'], additionalProperties: false },
    annotations: ann('Write a tour\'s notes', { destructiveHint: true }),
    securitySchemes: auth('events.write'),
  },
  {
    name: 'publish_event',
    title: 'Publish an event',
    description: 'Publish one of the signed-in organiser\'s draft events, so anyone with its link can see it (Windline: at tour., event. or ride.windline.tech/<address>). Private events can\'t be published. ALWAYS ask the user to confirm first, then call with confirm: true.',
    inputSchema: { type: 'object', properties: { event_id: { type: 'string', description: 'The draft\'s id, from list_my_events or create_event.' }, address: { type: 'string', description: 'Windline: the public address, lowercase letters, numbers and hyphens, e.g. "cape-coast-2027".' }, confirm: { type: 'boolean', description: 'true only after the user said yes.' } }, required: ['event_id', 'confirm'], additionalProperties: false },
    annotations: ann('Publish an event', { destructiveHint: true }),
    securitySchemes: auth('events.publish'),
  },
  {
    name: 'post_club_ride',
    title: 'Post a club ride or run',
    description: 'Post a DRAFT group ride (Windline) or club run (RunFast) on a club or organiser page the signed-in person runs, from a GPX route or link, once or weekly. Publish it with publish_event. Confirm the details with the user first.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', description: 'The club or organiser page address (livedot.me/<address>).' }, name: { type: 'string', description: 'The ride\'s or run\'s name, e.g. "Saturday coffee ride".' }, ...ROUTE,
      start: { type: 'string', description: 'A one-off: "YYYY-MM-DD HH:MM" local. Weekly: the first one.' }, weekly: { type: 'object', description: 'Weekly: { days: [0-6, Sunday is 0], time: "HH:MM" }.', properties: { days: { type: 'array', items: { type: 'integer' } }, time: { type: 'string' } } }, tz: { type: 'string', description: 'IANA time zone; else worked out from where the route starts.' }, description: { type: 'string', description: 'What the ride or run is, for the club page.' }, place: { type: 'string', description: 'RunFast: where it starts, in words.' } },
      required: ['page', 'name', 'start'], additionalProperties: false },
    annotations: ann('Post a club ride or run', { destructiveHint: false }),
    securitySchemes: auth('clubs.post'),
  },
];
WRITE_TOOLS.forEach((t) => { t._meta = { ...(t._meta || {}), securitySchemes: t.securitySchemes }; }); // ChatGPT reads both
WRITE_TOOLS.find((t) => t.name === 'plan_route')._meta = { ...WRITE_TOOLS.find((t) => t.name === 'plan_route')._meta, 'openai/fileParams': ['gpx_file'] };

// ---------------------------------------------------------------- helpers
const LOCAL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/;
function parts(ms, tz) { const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).forEach((x) => { o[x.type] = x.value; }); return o; }
const offset = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
/** "YYYY-MM-DD HH:MM" in tz → ISO (Windline's tz.js toInstant). An ISO with an offset is taken as it is. */
function toIso(s, tz) {
  const t = String(s || '').trim(); if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(t) && Number.isFinite(Date.parse(t))) return new Date(Date.parse(t)).toISOString();
  const m = LOCAL.exec(t); if (!m) return null;
  const [y, mo, d] = m[1].split('-').map(Number), g = Date.UTC(y, mo - 1, d, +m[2], +m[3]); let x = g - offset(g, tz); x = g - offset(x, tz); return new Date(x).toISOString();
}
const okTz = (z) => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return typeof z === 'string' && /\//.test(z); } catch (e) { return false; } };
const zoneAt = (p) => { try { const z = tzlookup(p[0], p[1]); return typeof z === 'string' && z.includes('/') ? z : null; } catch (e) { return null; } };
const local = (iso, tz) => { const p = parts(Date.parse(iso), tz); return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(+p.hour % 24).padStart(2, '0')}:${p.minute}` }; };

class Plain extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

/** Routes through Windline's reader (gpxroute.js): the challenges' GPX reader and the dashboard's thinning, never Strava. */
async function readRoutes(ctx, src) {
  const H = ctx.R.H, body = src.url ? { url: String(src.url) } : src.gpx ? { gpx: String(src.gpx) } : null;
  if (!body) throw new Plain('Attach the GPX file, or give a link to the route (Ride with GPS, or a GPX file).');
  const headers = { 'Content-Type': 'application/json', ...(ctx.proxy || {}) };
  let r; try { r = await fetch(`${H.mcp}/route`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); } catch (e) { throw new Plain('The route reader didn’t answer. Try again in a moment.', 502); }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ok) throw new Plain((j && j.error) || 'That route couldn’t be read.', r.status || 400);
  return j.routes;
}

// ---------------------------------------------------------------- plan_route (no account)
export async function planRoute(ctx, args, sponsorLine) {
  const src = { ...args }; if (!src.gpx && !src.url && args.gpx_file && args.gpx_file.download_url) src.url = args.gpx_file.download_url;
  const routes = await readRoutes(ctx, src), first = routes[0];
  const tz = okTz(args.tz) ? args.tz : zoneAt(first.pts[0]) || 'UTC', sport = args.sport === 'run' ? 'run' : 'ride';
  const starts = [args.start].concat(Array.isArray(args.starts) ? args.starts : []);
  const iso = toIso(starts[0], tz); if (!iso) throw new Plain('When do you start? Give a date and time, "YYYY-MM-DD HH:MM".');
  const kmh = sport === 'run' ? 60 / (Number(args.pace) > 2 && Number(args.pace) < 20 ? Number(args.pace) : 6) : (Number(args.pace) > 5 && Number(args.pace) < 60 ? Number(args.pace) : 25);
  const days = routes.slice(0, 30).map((r, i) => { const s = i === 0 ? Date.parse(iso) : Date.parse(toIso(starts[i] || '', tz) || '') || Date.parse(iso) + i * 864e5; return { name: r.name || `Day ${i + 1}`, date: new Date(s).toISOString().slice(0, 10), startMs: s, pts: r.pts, km: r.km, kmh, stops: 0 }; });
  const P = { name: first.name || 'Your route', sport, tz, app: sport === 'run' ? 'runfast' : 'windline', timedFor: sport === 'run' ? `a runner at ${Math.floor(60 / kmh)}:${String(Math.round((60 / kmh % 1) * 60)).padStart(2, '0')} per km` : `a rider at ${Math.round(kmh)} km/h`,
    url: sport === 'run' ? 'https://runfast.tech' : 'https://windline.tech', days };
  const out = await eventWeather(ctx, { event: P.name, units: args.units, _plan: P }, sponsorLine);
  out.text = out.text.replace(/\nMore: https:\/\/(windline|runfast)\.tech/, `\nMake it an event${sport === 'run' ? ' in RunFast' : ' in Windline'}: ${P.url}`);
  if (out.structured) out.structured = { ...out.structured, view: 'plan_route', tz, km: Math.round(routes.reduce((s, r) => s + r.km, 0) * 10) / 10 };
  if (out.map) out.map.follow = { url: P.url, label: sport === 'run' ? 'Open RunFast' : 'Open Windline' };
  return out;
}

// ---------------------------------------------------------------- the signed-in tools: read the routes here, then the app's server
async function tool(ctx, name, args) {
  if (!ctx.authorization) throw new NeedAuth(SCOPE[name]);
  let r; try { r = await fetch(`${ctx.R.H.mcp}/tool/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ctx.authorization }, body: JSON.stringify({ args }), signal: AbortSignal.timeout(45000) }); }
  catch (e) { throw new Plain('Windline didn’t answer. Try again in a moment.', 502); }
  if (r.status === 401) throw new NeedAuth(SCOPE[name], 'invalid_token');
  const j = await r.json().catch(() => null);
  if (!j) throw new Plain('That didn’t go through. Try again in a moment.', 502);
  if (!j.ok) throw new Plain(j.error || 'That didn’t go through.', r.status);
  return j;
}
/** A day's route, start and label → what both servers take: Windline { pts, km, climb, start (ISO), label, from, to }, RunFast's route. */
async function daysOf(ctx, a) {
  let list = [];
  if (a.url && !Array.isArray(a.days)) { const rs = await readRoutes(ctx, { url: a.url }); const starts = Array.isArray(a.starts) ? a.starts : [a.start]; list = rs.map((r, i) => ({ r, start: starts[i] || null, label: rs.length > 1 ? `Day ${i + 1}` : '' })); }
  else for (const [i, d] of (Array.isArray(a.days) ? a.days : [a]).entries()) { const rs = await readRoutes(ctx, d); list.push({ r: rs[0], start: d.start || null, label: d.label || '' }); if (i > 30) break; }
  if (!list.length) throw new Plain('Add the route: a GPX file or a link.');
  const tz = okTz(a.tz) ? a.tz : zoneAt(list[0].r.pts[0]) || 'UTC';
  const days = list.map((x, i) => { const start = toIso(x.start, tz); if (!start) throw new Plain(`${list.length > 1 ? `Day ${i + 1}: g` : 'G'}ive its local start, "YYYY-MM-DD HH:MM".`); return { pts: x.r.pts, km: x.r.km, climb: x.r.climb, from: x.r.from, to: x.r.to, label: x.label, start }; });
  return { tz, days };
}
const withSponsor = (j, sponsorLine, view) => ({ text: `${j.text}\n\n${sponsorLine}`, structured: { view, app: j.app, ...(j.data || {}), sponsor_line: sponsorLine }, map: null });

// ---------------------------------------------------------------- the draft's card (create_event): what was made, from the routes read here
const DAY_COLOURS = ['#635BFF', '#1E9BD7', '#2FBF8F', '#F5A524', '#E5484D', '#8E4EC6', '#0EA5A4', '#B54708'];
const hav = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
const thou = (n) => Math.round(n).toLocaleString('en-US');
/** The widget's view of a new draft (create_event, post_club_ride): the days with their distance, climbing and start, the whole route coloured day by day,
 *  "Draft · Publish when you're ready" and Open in Windline (or RunFast). Every number is the route reader's and the app's answer. */
function draftView(ctx, ev, S, sponsorLine) {
  const { tz, days } = ev, run = ev.type === 'run', app = (S && S.app) || (run ? 'runfast' : 'windline'), f = ctx.f0(tz), imp = f.system === 'imperial';
  const dist = (km) => `${f.num(km)} ${f.label.dist}`, climb = (m) => `${thou(imp ? m * 3.28084 : m)} ${imp ? 'ft' : 'm'}`;
  const date = (iso, o) => { try { return new Date(iso).toLocaleDateString('en-GB', { timeZone: tz, ...o }); } catch (e) { return iso.slice(0, 10); } };
  const multi = days.length > 1, per = Math.max(2, Math.floor(700 / days.length)), course = [], starts = [];
  let along = 0;
  days.forEach((d) => {
    const pts = (d.pts || []).filter((p) => isFinite(p[0]) && isFinite(p[1])), step = Math.max(1, Math.ceil(pts.length / per));
    const thin = pts.filter((p, i) => i % step === 0 || i === pts.length - 1).map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]);
    if (course.length && thin.length) along += hav(course[course.length - 1], thin[0]);
    starts.push(along);
    thin.forEach((p, i) => { if (i) along += hav(thin[i - 1], p); course.push(p); });
  });
  const total = along || 1, colour = (i) => (multi ? DAY_COLOURS[i % DAY_COLOURS.length] : run ? '#EE7A1F' : '#635BFF');
  const km = days.reduce((s, d) => s + (d.km || 0), 0), up = days.reduce((s, d) => s + (d.climb || 0), 0);
  const word = ev.club ? (run ? 'Club run' : 'Group ride') : run ? (ev.race ? 'Race' : 'Run') : ({ tour: 'Tour', race: 'Race', ride: 'Ride' })[ev.type] || 'Event';
  const first = days[0], last = days[days.length - 1], note = 'Draft · Publish when you’re ready';
  const stats = [{ k: multi ? 'First day' : 'Start', v: clock(Date.parse(first.start), tz, f), sub: ev.weekly ? 'Every week from ' + date(first.start, { day: 'numeric', month: 'short' }) : date(first.start, { day: 'numeric', month: 'short', year: 'numeric' }) }];
  if (multi) stats.push({ k: 'Last day', v: clock(Date.parse(last.start), tz, f), sub: date(last.start, { day: 'numeric', month: 'short', year: 'numeric' }) });
  stats.push({ k: 'Distance', v: dist(km), sub: multi ? `${days.length} days` : null }, { k: 'Climbing', v: climb(up), sub: 'up' });
  return {
    kind: 'draft', sport: run ? 'run' : 'ride', app, name: ev.name, race: [word, multi ? `${days.length} days` : null, dist(km)].filter(Boolean).join(' · '), status: 'draft', statusWord: 'Draft',
    course, stops: days.map((d, i) => [+(starts[i] / total).toFixed(4), colour(i)]), progress: 0, dot: null,
    key: multi ? days.map((d, i) => [colour(i), d.label || `Day ${i + 1}`]) : null, keyTitle: 'Day by day',
    headline: `${dist(km)} · ${climb(up)} up`, stats,
    ahead: days.map((d, i) => ({ k: [d.label || (multi ? `Day ${i + 1}` : ''), d.from && d.to ? `${d.from} → ${d.to}` : d.from || d.to || ''].filter(Boolean).join(' · ') || ev.name,
      at: clock(Date.parse(d.start), tz, f), v: dist(d.km || 0), sub: `${climb(d.climb || 0)} up · ${date(d.start, { weekday: 'short', day: 'numeric', month: 'short' })}`, c: colour(i) })),
    aheadTitle: multi ? 'Day by day' : 'The route',
    follow: { url: (S && S.dashboard) || (app === 'runfast' ? 'https://runfast.tech' : 'https://app.windline.tech'), label: app === 'runfast' ? 'Open in RunFast' : 'Open in Windline' },
    updated: note, sponsor: sponsorLine, units: f.system,
  };
}

export async function writeTool(ctx, name, args, sponsorLine) {
  const a = args || {};
  if (!ctx.authorization) throw new NeedAuth(SCOPE[name]); // before reading any route: nothing is read for someone who can't write
  if (name === 'list_my_events') return withSponsor(await tool(ctx, name, {}), sponsorLine, 'my_events');
  if (name === 'create_event' || name === 'post_club_ride') {
    const { tz, days } = await daysOf(ctx, a), first = local(days[0].start, tz);
    const weekly = a.weekly && Array.isArray(a.weekly.days) ? { days: a.weekly.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6), time: a.weekly.time || first.time } : null;
    const type = name === 'post_club_ride' ? 'ride' : a.type;
    const out = {
      // Windline
      type, name: a.name, tz, days, description: a.description, notes: a.notes, page: a.page || a.club, schedule: weekly ? weekly : { once: first.date, time: first.time },
      // RunFast (a run or a race; a club run on a club they manage)
      kind: type === 'run' ? (a.race ? 'race' : 'run') : type === 'race' ? 'race' : undefined, date: first.date, time: first.time, weekly: weekly || undefined,
      route: { pts: days[0].pts, km: days[0].km, climb: days[0].climb }, place: a.place, pace: a.pace, club: a.club || a.page,
    };
    const res = withSponsor(await tool(ctx, name, out), sponsorLine, name === 'post_club_ride' ? 'club_ride' : 'created');
    const club = name === 'post_club_ride', app = res.structured && res.structured.app; // a club ride on Windline, a club run on RunFast: the account's app
    res.map = draftView(ctx, { name: a.name, type: club ? (app === 'runfast' ? 'run' : 'ride') : type, race: !club && !!a.race, club, tz, days, weekly }, res.structured, sponsorLine);
    return res;
  }
  if (name === 'update_event' || name === 'add_tour_notes' || name === 'publish_event') return withSponsor(await tool(ctx, name, { ...a, id: a.event_id }), sponsorLine, name);
  throw new Plain('Unknown tool.');
}
export const _test = { toIso, zoneAt, local };
