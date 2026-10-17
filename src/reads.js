// The public reads, and nothing else: the same GETs livedot.me and the apps' follow pages make (no sign-in, no cookies, CORS *).
// Windline contract handoffs/2026-10-15-windline-live-api.md §5, §14, §16; RunFast live-api-v1.2; LiveDot PROFILE-API.md.
// No admin access, no database, no route of our own around them: whatever an answer leaves out stays out.

export const SITE = { windline: 'https://windline.tech', runfast: 'https://runfast.tech', livedot: 'https://livedot.me' };
export const APPS = ['windline', 'runfast'];
export const SPORT = { windline: 'cycling', runfast: 'running' };
export const PERSON = { windline: 'rider', runfast: 'runner' };
export const NAME = { windline: 'Windline', runfast: 'RunFast' };

/** Where each app's API is: the real servers, or (for tests) WINDLINE_API / RUNFAST_API, as functions/[slug].js reads them. */
export function hosts(env = {}) {
  return {
    windline: (env.WINDLINE_API || SITE.windline) + '/api',
    runfast: (env.RUNFAST_API || SITE.runfast) + '/api',
    forecast: env.FORECAST_API || 'https://windline.tech/api/forecast', // Windline's forecast store (Apple Weather), as both follow pages ask it
    mcp: env.MCP_AUTH_API || 'https://windline.tech/api/mcp', // livedot MCP's sign-in, route reader and write tools (Windline's mcpApi)
  };
}

const UA = 'livedot-mcp/1.0 (+https://livedot.me/mcp)';

/** GET a public read → { ok, status, body, headers }. Never throws: a failure is { ok: false, status: 0 }. */
export async function getJson(url, ms = 7000, cacheTtl = 0) {
  try {
    const init = { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(ms) };
    if (cacheTtl) init.cf = { cacheTtl, cacheEverything: true };
    const r = await fetch(url, init);
    let body = null; try { body = await r.json(); } catch (e) { body = null; }
    return { ok: r.ok, status: r.status, body, headers: r.headers };
  } catch (e) { return { ok: false, status: 0, body: null, headers: null, timeout: !!(e && (e.name === 'TimeoutError' || e.name === 'AbortError')) }; }
}

/** reads(env, trace): trace, if given, gets { app, status, timeout } for each app server asked (livedot misses, server.js). */
export function reads(env = {}, trace = null) {
  const seen = (app) => (r) => { if (trace && trace.length < 40) trace.push({ app, status: r.status, timeout: !!r.timeout }); return r; };
  const H = hosts(env), api = (app, p, ms, ttl) => getJson(H[app] + p, ms, ttl).then(seen(app));
  // the demos are always the apps' own, on their real servers (also when a test points the rest at sample data)
  const demo = (app, p, ms, ttl) => getJson(SITE[app] + '/api' + p, ms, ttl).then(seen(app)), isD = (id) => /^(coast|comrades)-demo$/.test(String(id));
  const e = encodeURIComponent;
  return {
    H,
    /** The handle registry (Windline's, for both apps): { handle, person: { name, photo }, state, live: [...], upcoming, follow } or { handle: null }. */
    handle: (name) => api('windline', '/handle/' + e(name)),
    /** An app's live view by handle: f/<code>'s answer, { riders | runners: [Live] }. */
    liveByHandle: (app, name) => api(app, '/live/h/' + e(name)),
    /** A follow link: { riders | runners: [Live] }. */
    liveByCode: (app, code) => (code === 'demo' ? demo : api)(app, '/live/f/' + e(code)),
    /** Findable people by pid. */
    liveByPid: (app, pids) => api(app, (app === 'windline' ? '/live/rider?pids=' : '/live/runner?pids=') + pids.map(e).join(',')),
    /** Findable people by name, any race (≥ 3 letters, up to 20). */
    find: (app, q) => api(app, '/live/find?q=' + e(q)),
    /** A race's map: with q, up to 20 matches; without, livedot's copy (the 50 furthest along, the count, the taps). */
    raceMap: (app, id, q) => (isD(id) ? demo : api)(app, '/live/race/' + e(id) + (q ? '?q=' + e(q) : '?for=livedot')),
    /** A race's course: Windline { days: [{ id, points }] }, RunFast { course }. Cached a few minutes at the edge. */
    course: (app, id) => (isD(id) ? demo : api)(app, '/race/' + e(id), 7000, 300),
    /** GET /api/profile: ?live=1 (live races), ?upcoming=1, ?q= (pages). */
    profile: (app, query) => api(app, '/profile?' + query),
    /** One published event as data, as the tour pages and the app read it: days, start times, paces, points, routeFiles (and notes). */
    event: (type, slug) => api('windline', '/event/' + e(type) + '/' + e(slug), 8000, 60),
    /** Windline's platform sponsor (the line on every livedot surface). */
    sponsor: () => getJson(SITE.windline + '/api/platform-sponsor', 3000, 600),
  };
}

/** The demo races, live all day on the apps' own servers (Windline contract §10, RunFast's comrades-demo): the only people a test,
 *  a reviewer or a directory can always find. Never in a name search unless the demo is asked for, as on livedot.me. */
export const DEMOS = [
  { app: 'windline', id: 'coast-demo', code: 'demo', name: 'Coast Classic (demo)', words: ['coast', 'classic', 'demo'] },
  { app: 'runfast', id: 'comrades-demo', code: 'demo', name: 'Comrades (demo)', words: ['comrades', 'demo'] },
];
export const isDemo = (x) => !!x && (/^pdemo/.test(String(x.pid || '')) || /\(demo\)\s*$/i.test(String(x.name || '')) || x.slug === 'demo');
