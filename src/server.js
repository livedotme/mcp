// livedot MCP: a read-only MCP server over Streamable HTTP (JSON responses, stateless, no auth: public data only).
// Tools: find_person, where_is, event_status. One UI resource (the live map), for MCP Apps hosts (Claude, ChatGPT) and as
// text everywhere else. handle(request, env) is the whole server; functions/mcp.js serves it at livedot.me/mcp.
import { reads } from './reads.js';
import { unitsFor } from './words.js';
import { findPerson, whereIs, eventStatus, eventWeatherTool, flyRouteTool, tourRouteTool, tourNotesTool } from './tools.js';
import { WIDGET_HTML } from './gen/widget.js';
import { WL_VERSION } from './gen/engine.js';
import { landing } from './landing.js';

export const VERSION = '1.0.0';
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const WIDGET_URI = 'ui://livedot/live-map.html';
const ICON = 'https://livedot.me/brand/icon.svg', ICON_PNG = 'https://livedot.me/brand/png/icon-512.png';

const UNITS = { type: 'string', enum: ['metric', 'imperial'], description: 'Pass the asker\'s units: imperial for users in the US, UK road distances, Liberia or Myanmar, or when they ask in miles/°F; otherwise metric.' };
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const uiMeta = (invoking, invoked) => ({
  ui: { resourceUri: WIDGET_URI, visibility: ['model', 'app'] }, 'ui/resourceUri': WIDGET_URI,
  'openai/outputTemplate': WIDGET_URI, 'openai/widgetAccessible': true, 'openai/toolInvocation/invoking': invoking, 'openai/toolInvocation/invoked': invoked,
});

export const TOOLS = [
  {
    name: 'find_person',
    title: 'Find someone racing live',
    description: 'Find a person in a live cycling or running race tracked on livedot (Windline for cycling, RunFast for running), e.g. "Where\'s Megan in the Comrades?" or "Is Thandi racing?". '
      + 'Pass what the user gave, as they wrote it: a name, a livedot handle (@megan, livedot.me/megan) or a follow link, and the race if they named one. '
      + 'One clear match (a handle, or a full name that fits one person) returns the live answer at once: where they are, time against their goal, finish time, the weather there, and a live map. '
      + 'Several matches return the 5 most likely and the total. Then ask the user ONE short question (surname or initial, bib or club) and call again with it, or call where_is with the person id they pick. Never guess between people. '
      + 'Only people who chose to be findable, on public races, can be found.',
    inputSchema: {
      type: 'object',
      properties: {
        name_or_handle: { type: 'string', description: 'The person\'s name as the user said it ("Megan", "Megan Naidoo"), a livedot handle exactly as typed ("@megan", "livedot.me/megan"; a capitalised name like "Megan" is searched as a name), or a follow link (livedot.me/megan, windline.tech/f/…, runfast.tech/f/…).' },
        event: { type: 'string', description: 'The race, if named: "Comrades", "Coast Classic". Narrows the search to that race.' },
        surname: { type: 'string', description: 'A surname or its first letter, to narrow many matches.' },
        bib: { type: 'string', description: 'A bib number, if the user gave one.' },
        club: { type: 'string', description: 'A club, if the user gave one.' },
        place: { type: 'string', description: 'A home town or country, if the user gave one.' },
        wave: { type: 'string', description: 'A start wave or start time, if the user gave one.' },
        units: UNITS,
      },
      required: ['name_or_handle'],
      additionalProperties: false,
    },
    annotations: { title: 'Find someone racing live', ...READ_ONLY },
    _meta: uiMeta('Looking for them…', 'Found'),
  },
  {
    name: 'where_is',
    title: 'Where someone is in a live race',
    description: 'Where someone is right now in a live race, and the weather they\'re in: km and mile on the course, time against their goal, pace, the finish time it points to, the temperature and wind there (headwind, tailwind or side-on) with the Windline forecast engine\'s rating, the wind and heat over the next few km, and a live map with a Follow live button. '
      + 'Use it with the person id find_person returned, or straight away with a livedot handle or follow link the user gave. '
      + 'It answers only what the public live page shows: if they\'re paused, stopped, near the start or finish, or not sharing, it says it can\'t share where they are; say so plainly.',
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'A person id from find_person, e.g. "runfast:p:pdemo00megan" or "h:megan".' },
        handle: { type: 'string', description: 'A livedot handle ("megan") or link (livedot.me/megan).' },
        code: { type: 'string', description: 'A follow link or its code (windline.tech/f/<code>, runfast.tech/f/<code>). "demo" with app gives the demo.' },
        units: UNITS,
      },
      additionalProperties: false,
    },
    annotations: { title: 'Where someone is in a live race', ...READ_ONLY },
    _meta: uiMeta('Finding them on the course…', 'Live'),
  },
  {
    name: 'event_status',
    title: 'How a live race is going',
    description: 'How a live race on livedot is going: whether it\'s live, how long it has been under way, how many people are on the map, how many have finished, who\'s out front and the leaders where the public race map shows them, with a live map. '
      + 'For "How\'s the Comrades going?" or "Who\'s leading the Coast Classic?". If several races match it lists them: ask the user which one. Try "Comrades demo" or "Coast Classic demo" to see it work any time.',
    inputSchema: {
      type: 'object',
      properties: { event: { type: 'string', description: 'The race\'s name, e.g. "Comrades", "Coast Classic demo".' }, units: UNITS },
      required: ['event'],
      additionalProperties: false,
    },
    annotations: { title: 'How a live race is going', ...READ_ONLY },
    _meta: uiMeta('Reading the race…', 'Live'),
  },
  {
    name: 'event_weather',
    title: 'Race-day weather for an event',
    description: 'What the weather will be like for a cycling or running event, for the people taking part: "What will the weather be like for the NYC Marathon?", "Weather for the Comrades demo?". '
      + 'Within 10 days of the start: the live forecast (Apple Weather) along the course at the times the riders or runners get to each stretch, with the Windline forecast engine\'s rating (Good, Fair, Tough) and why, the headwind and tailwind stretches, heat stress and rain. '
      + 'Further out: 10 years of weather on that date (Copernicus ERA5), clearly labelled as history, not a forecast. With a map of the course coloured by the wind or the heat, and a link to the event\'s livedot page. '
      + 'If several events match it lists them: ask which one.',
    inputSchema: {
      type: 'object',
      properties: { event: { type: 'string', description: 'The event\'s name, e.g. "NYC Marathon", "Gravel Burn", "Comrades demo".' }, year: { type: 'integer', description: 'The edition\'s year, if the user named one.' }, units: UNITS },
      required: ['event'],
      additionalProperties: false,
    },
    annotations: { title: 'Race-day weather for an event', ...READ_ONLY },
    _meta: uiMeta('Reading the weather on the course…', 'Weather ready'),
  },
  {
    name: 'fly_route',
    title: 'Fly the course',
    description: 'Fly over a race course inline: "Fly the Comrades", "Show me the course", "What does the NYC Marathon route look like?". '
      + 'Returns a flyover of the course on a map that plays in the chat, coloured by the weather along it (the live forecast within 10 days of the start, 10 years of weather on that date beyond it, as event_weather), with a "Fly it in 3D" link to the full Fly the route and the event\'s livedot page. '
      + 'If several events match it lists them: ask which one.',
    inputSchema: {
      type: 'object',
      properties: { event_or_route: { type: 'string', description: 'The event or route, e.g. "Comrades", "NYC Marathon", "Gravel Burn".' }, year: { type: 'integer', description: 'The edition\'s year, if named.' }, units: UNITS },
      required: ['event_or_route'],
      additionalProperties: false,
    },
    annotations: { title: 'Fly the course', ...READ_ONLY },
    _meta: uiMeta('Taking off…', 'Ready to fly'),
  },
  {
    name: 'tour_route',
    title: 'A cycling tour\'s route',
    description: 'A Windline cycling tour\'s route, day by day: "What\'s the Durban Tour 2027 route?", "Give me the GPX files for Alistair\'s tour". '
      + 'Finds a published tour by its name, its address or its organiser\'s or club\'s name, and returns each day (from and to, distance, climbing, start time), a map of every day, and the weather (the live forecast within 10 days, 10 years of weather on the date beyond). '
      + 'Route files (GPX, Garmin .fit) only when the organiser lets riders download them; otherwise say "The organiser hasn\'t made the route files available." Never make up a file link. If several tours match, ask which.',
    inputSchema: { type: 'object', properties: { tour: { type: 'string', description: 'The tour\'s name, address or organiser, e.g. "ProLend 2027 Durban Tour", "AllyCat".' }, units: UNITS }, required: ['tour'], additionalProperties: false },
    annotations: { title: 'A cycling tour\'s route', ...READ_ONLY },
    _meta: uiMeta('Reading the tour…', 'Tour ready'),
  },
  {
    name: 'tour_notes',
    title: 'A cycling tour\'s notes for riders (beta)',
    description: 'Beta, cycling tours only: the organiser\'s own notes for riders on a Windline tour (what to pack, how the tour runs, meeting points), for questions like "What should I pack for the Durban tour?". '
      + 'Answer only from the notes: quote and summarise them as the organiser\'s words, never invent anything, and say so when they don\'t cover the question.',
    inputSchema: { type: 'object', properties: { tour: { type: 'string', description: 'The tour\'s name, address or organiser.' }, question: { type: 'string', description: 'The rider\'s question, if any.' } }, required: ['tour'], additionalProperties: false },
    annotations: { title: 'A cycling tour\'s notes for riders (beta)', ...READ_ONLY },
  },
];

const RESOURCE = {
  uri: WIDGET_URI, name: 'livedot live map', title: 'livedot live map', mimeType: 'text/html;profile=mcp-app',
  description: 'The live map: the course, where they are, the wind and heat on the road ahead, and Follow live.',
};
// The widget reads only these: MapLibre from unpkg, OpenFreeMap's light (positron) basemap, the open terrain tiles the flyover's hills
// come from (AWS Terrain Tiles, as RunFast's Fly), livedot's typeface. Never a per-tile map key.
const CSP = { connectDomains: ['https://tiles.openfreemap.org', 'https://s3.amazonaws.com'], resourceDomains: ['https://unpkg.com', 'https://tiles.openfreemap.org', 'https://s3.amazonaws.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'] };
const RESOURCE_META = {
  ui: { csp: CSP, prefersBorder: true },
  'openai/widgetCSP': { connect_domains: CSP.connectDomains, resource_domains: CSP.resourceDomains },
  'openai/widgetPrefersBorder': true,
  'openai/widgetDescription': 'A live map of the person on the course with the wind and heat ahead. The text answer already has the facts; don\'t repeat the map.',
};

const INSTRUCTIONS = 'livedot answers where people are in live cycling (Windline) and running (RunFast) races, with the weather where they are from Windline\'s forecast engine. '
  + 'Start with find_person for a name; use where_is for a handle, link or a person id; event_status for how a race is going; event_weather for what the weather will be like at an event; fly_route to fly over a course; tour_route and tour_notes for Windline cycling tours. When a name matches several people, ask one short question and never guess. '
  + 'Only public data: findable people on public races.';

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id: id == null ? null : id, error: { code, message } });

async function call(name, args, meta, env) {
  const R = reads(env), now = Date.now(), ctx = { R, now, f0: (tz) => unitsFor(args.units, meta, tz) };
  const fn = { find_person: findPerson, where_is: whereIs, event_status: eventStatus, event_weather: eventWeatherTool, fly_route: flyRouteTool, tour_route: tourRouteTool, tour_notes: tourNotesTool }[name];
  if (!fn) return null;
  const out = await fn(ctx, args || {});
  const res = { content: [{ type: 'text', text: out.text }], structuredContent: out.structured || {} };
  if (out.map) res._meta = { 'livedot/view': out.map };
  return res;
}

/** One JSON-RPC message → a response object, or null for a notification. */
export async function rpc(msg, env = {}) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg && msg.id, -32600, 'Invalid Request');
  const { id, method, params = {} } = msg, note = id === undefined || id === null;
  try {
    switch (method) {
      case 'initialize': {
        const v = VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0];
        return ok(id, { protocolVersion: v, capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { name: 'livedot', title: 'livedot MCP', version: VERSION, websiteUrl: 'https://livedot.me', icons: [{ src: ICON, mimeType: 'image/svg+xml', sizes: ['any'] }, { src: ICON_PNG, mimeType: 'image/png', sizes: ['512x512'] }] },
          instructions: INSTRUCTIONS });
      }
      case 'ping': return note ? null : ok(id, {});
      case 'tools/list': return ok(id, { tools: TOOLS });
      case 'tools/call': {
        const t = TOOLS.find((x) => x.name === params.name);
        if (!t) return err(id, -32602, 'Unknown tool: ' + params.name);
        const a = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
        const res = await call(params.name, a, params._meta || {}, env);
        return ok(id, res);
      }
      case 'resources/list': return ok(id, { resources: [{ ...RESOURCE, _meta: RESOURCE_META }] });
      case 'resources/templates/list': return ok(id, { resourceTemplates: [] });
      case 'resources/read': {
        if (params.uri !== WIDGET_URI) return err(id, -32002, 'Resource not found');
        return ok(id, { contents: [{ uri: WIDGET_URI, mimeType: RESOURCE.mimeType, text: WIDGET_HTML, _meta: RESOURCE_META }] });
      }
      case 'prompts/list': return ok(id, { prompts: [] });
      default:
        if (method.startsWith('notifications/')) return null;
        return note ? null : err(id, -32601, 'Method not found: ' + method);
    }
  } catch (e) {
    return note ? null : ok(id, { isError: true, content: [{ type: 'text', text: 'livedot couldn\'t answer just now. Try again in a moment.' }] });
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version', 'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...CORS } });



/** The whole server: POST JSON-RPC (one message or a batch); GET is this page for a browser and 405 for an event stream. */
export async function handle(request, env = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (/text\/event-stream/.test(request.headers.get('Accept') || '')) return new Response(null, { status: 405, headers: { Allow: 'POST', ...CORS } });
    // a person in a browser: livedot MCP's page (indexable on livedot.me only)
    const host = new URL(request.url).hostname, sp = await reads(env).sponsor(), name = (sp.ok && sp.body && sp.body.sponsor && sp.body.sponsor.name) || 'ProLend';
    const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Livedot-Engine': WL_VERSION, Vary: 'Accept' };
    if (host !== 'livedot.me') h['X-Robots-Tag'] = 'noindex';
    return new Response(request.method === 'HEAD' ? null : landing(host, name), { headers: h });
  }
  if (request.method === 'DELETE') return new Response(null, { status: 405, headers: { Allow: 'POST', ...CORS } });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST, GET', ...CORS } });
  let body; try { const t = await request.text(); if (t.length > 64 * 1024) return json(err(null, -32600, 'Too large'), 413); body = JSON.parse(t); } catch (e) { return json(err(null, -32700, 'Parse error'), 400); }
  if (Array.isArray(body)) {
    if (!body.length || body.length > 10) return json(err(null, -32600, 'Invalid Request'), 400);
    const out = (await Promise.all(body.map((m) => rpc(m, env)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await rpc(body, env);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
}
