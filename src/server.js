// livedot MCP: a read-only MCP server over Streamable HTTP (JSON responses, stateless, no auth: public data only).
// Tools: find_person, where_is, event_status. One UI resource (the live map), for MCP Apps hosts (Claude, ChatGPT) and as
// text everywhere else. handle(request, env) is the whole server; functions/mcp.js serves it at livedot.me/mcp.
import { reads } from './reads.js';
import { unitsFor } from './words.js';
import { findPerson, whereIs, eventStatus, eventWeatherTool, flyRouteTool, tourRouteTool, tourNotesTool, tapOnTheBack } from './tools.js';
import { WIDGET_HTML } from './gen/widget.js';
import { WL_VERSION } from './gen/engine.js';
import { landing } from './landing.js';
import { WRITE_TOOLS, SCOPE, NeedAuth, planRoute, writeTool, RESOURCE_META as PRM_URL } from './writes.js';
import { sponsorLineFor } from './tools.js';
import { OUTPUT_SCHEMAS, promptList, promptGet } from './schemas.js';

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
  {
    name: 'tap_on_the_back',
    title: 'Give someone a tap on the back',
    description: 'Send someone in a live race a tap on the back: it buzzes on their phone, with your name if you\'re signed in (or the first name you give). In the day after their finish it lands as a congratulation. '
      + 'Only when the user asks to give them a tap on the back (or to cheer them on, say well done): never on your own, and one per ask. Use the person id from find_person, or a livedot handle or follow link. '
      + 'It keeps the person\'s own settings and the follow page\'s rules: if they turned taps off, aren\'t live, or only take taps from people with their link, it says so; tell the user plainly. Returns the live map too.',
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'A person id from find_person, e.g. "runfast:p:pdemo00megan" or "h:megan".' },
        handle: { type: 'string', description: 'A livedot handle ("megan") or link (livedot.me/megan).' },
        code: { type: 'string', description: 'A follow link or its code (windline.tech/f/<code>, runfast.tech/f/<code>).' },
        name: { type: 'string', description: 'The first name the user wants on the tap ("Sam"), if they gave one. A signed-in user\'s tap shows their own public name instead.' },
        units: UNITS,
      },
      additionalProperties: false,
    },
    annotations: { title: 'Give someone a tap on the back', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: uiMeta('Sending the tap…', 'Tap sent'),
  },
];

// Read tools need no account; the write tools sign in (OAuth 2.1, writes.js). ChatGPT reads securitySchemes per tool.
TOOLS.forEach((t) => { t.securitySchemes = t.name === 'tap_on_the_back' ? [{ type: 'noauth' }, { type: 'oauth2', scopes: [] }] : [{ type: 'noauth' }]; t._meta = { ...t._meta, securitySchemes: t.securitySchemes }; }); // a tap: anyone; signed in, it carries your name
TOOLS.push(...WRITE_TOOLS);
{ const pr = TOOLS.find((t) => t.name === 'plan_route'); pr._meta = { ...uiMeta('Reading your route…', 'Weather ready'), ...pr._meta }; } // plan_route draws the weather map
for (const n of ['create_event', 'post_club_ride']) { const t = TOOLS.find((x) => x.name === n); t._meta = { ...uiMeta('Creating the draft…', 'Draft ready'), ...t._meta }; } // both draw the draft's card
// every tool says what its structuredContent looks like (schemas.js), so a client can check the answer
TOOLS.forEach((t) => { if (!OUTPUT_SCHEMAS[t.name]) throw new Error('No outputSchema for ' + t.name); t.outputSchema = OUTPUT_SCHEMAS[t.name]; });

const GUIDE_URI = 'livedot://guide';
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
  + 'Only public data: findable people on public races. plan_route needs no account. Organisers and club admins can sign in with their Windline or RunFast account (OAuth) to list, create and change their own events: new events are drafts, nothing is published without the user confirming, and finished events never change.';

export const DESCRIPTION = 'Live race tracking in the chat: where someone is in a live cycling or running race, the weather on the course from Windline\'s forecast engine, race-day forecasts and a flyover of the course, with a live map. Free.';
const SERVER_INFO = { name: 'livedot', title: 'livedot MCP', version: VERSION, description: DESCRIPTION, websiteUrl: 'https://livedot.me/mcp',
  icons: [{ src: ICON, mimeType: 'image/svg+xml', sizes: ['any'] }, { src: ICON_PNG, mimeType: 'image/png', sizes: ['512x512'] }] };
const CAPABILITIES = { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } };

// A short guide for the model (and anyone reading the server's resources): what to call when, and the demo races that always work.
const GUIDE = `# livedot MCP

${DESCRIPTION}

## Which tool
- A name ("Where's Megan in the Comrades?"): find_person. Several matches: ask the user one short question, never guess.
- A livedot handle (@megan, livedot.me/megan), a follow link or a person id: where_is.
- Give someone a tap on the back (only when the user asks): tap_on_the_back. It buzzes on their phone; in the day after their finish it's a congratulation.
- How a race is going, who's leading: event_status.
- The weather for an event: event_weather. Fly over a course: fly_route.
- A Windline cycling tour's days and route files: tour_route; the organiser's notes for riders: tour_notes (beta).
- The weather along your own route (a GPX file or a Ride with GPS link): plan_route.
- Organisers and club admins, signed in (OAuth): list_my_events, create_event, update_event, add_tour_notes, publish_event, post_club_ride. New events are drafts; nothing is published without the user's yes.
- Several GPX files are one tour: pass them all to create_event (or plan_route for the weather). The days are ordered by the numbers in the file names, else by the map; the first call returns the plan to check with the user, then confirm: true makes it.
- Invite a club's members or a tour's riders by email, from a CSV: invite_members (a preview first; nobody joins until they confirm).
- Who it's for: if they run a club or organiser page (list_my_events) and didn't say, ask once: a private ride or run for them (create_event, visibility private), or the club's (post_club_ride).

## Try it any time
"Comrades demo" (running) and "Coast Classic demo" (cycling) are demo races that are live all day: event_status "Coast Classic demo", event_weather "Comrades demo", fly_route "Comrades demo".

## Privacy
Only public data: people who chose to be findable, on public races. Positions near the start and finish, and of anyone paused or stopped, are never shared. No account is needed to ask.

More: https://livedot.me/mcp
`;
const RESOURCES = () => [{ ...RESOURCE, _meta: RESOURCE_META },
  { uri: GUIDE_URI, name: 'livedot guide', title: 'How to use livedot MCP', mimeType: 'text/markdown', description: 'Which tool to use when, the demo races that always work, and what livedot will and won\'t share.' }];

/** The static server card (/.well-known/mcp/server-card.json, SEP-1649): the same tools, prompts and resources the server lists. */
export function serverCard(origin = 'https://livedot.me') {
  return { protocolVersion: VERSIONS[0], serverInfo: SERVER_INFO,
    description: DESCRIPTION, transport: { type: 'streamable-http', endpoint: `${origin}/mcp` }, capabilities: CAPABILITIES, instructions: INSTRUCTIONS,
    authentication: { required: false, schemes: ['oauth2'], note: 'Every read tool works without an account; organisers sign in (OAuth 2.1) for the event tools.', protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource/mcp` },
    tools: TOOLS, prompts: promptList(), resources: RESOURCES() };
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id: id == null ? null : id, error: { code, message } });

// The free paths (no sign-in): one line to a free account in the app that fits the sport, before the sponsor line, measured by ?ref=mcp.
// Never on a signed-in answer, never on an answer with nothing in it.
const FREE = new Set(['find_person', 'where_is', 'event_status', 'event_weather', 'fly_route', 'tour_route', 'tour_notes', 'plan_route', 'tap_on_the_back']);
export const SIGNUP = {
  windline: { label: 'Plan it in Windline, free: create your account', url: 'https://app.windline.tech/?ref=mcp#/signup' },
  runfast: { label: 'Plan it in RunFast, free: create your account', url: 'https://runfast.tech/app/?ref=mcp#/signup' },
};
function signupLine(out, sponsor) {
  const S = out.structured, first = Array.isArray(S.people) && S.people[0], run = /^run/.test(String(S.sport || (first && first.sport) || '')) || S.app === 'runfast' || (out.map && out.map.sport === 'run');
  const cta = SIGNUP[run ? 'runfast' : 'windline'], line = `${cta.label}: ${cta.url}`;
  out.text = out.text.endsWith(sponsor) ? `${out.text.slice(0, -sponsor.length).replace(/\s*$/, '')}\n${line}\n\n${sponsor}` : `${out.text}\n${line}`;
  out.structured = { ...S, signup: cta }; if (out.map) out.map.cta = cta;
}

/** The assistant's own anonymous id for its user (ChatGPT's openai/subject), hashed here before it goes anywhere: a tap's tapper. */
async function sha256hex(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

async function call(name, args, meta, env, rq = {}) {
  const R = reads(env), now = Date.now(), sub = meta && typeof meta['openai/subject'] === 'string' ? meta['openai/subject'] : '', ctx = { asker: sub ? await sha256hex('livedot-asker|' + sub) : null, R, now, f0: (tz) => unitsFor(args.units, meta, tz), authorization: rq.authorization || null, proxy: rq.proxy || null };
  const fn = { find_person: findPerson, where_is: whereIs, event_status: eventStatus, event_weather: eventWeatherTool, fly_route: flyRouteTool, tour_route: tourRouteTool, tour_notes: tourNotesTool, tap_on_the_back: tapOnTheBack }[name];
  let out;
  try {
    if (fn) out = await fn(ctx, args || {});
    else if (name === 'plan_route') out = await planRoute(ctx, args || {}, await sponsorLineFor(R));
    else if (SCOPE[name]) out = await writeTool(ctx, name, args || {}, await sponsorLineFor(R));
    else return null;
  } catch (e) {
    if (e instanceof NeedAuth) throw e;
    if (e && e.status) return { isError: true, content: [{ type: 'text', text: e.message + '\n\n' + (await sponsorLineFor(R)) }], structuredContent: { view: 'none', error: e.message } };
    throw e;
  }
  if (!ctx.authorization && FREE.has(name) && out.structured && out.structured.view !== 'none') signupLine(out, await sponsorLineFor(R));
  const res = { content: [{ type: 'text', text: out.text }], structuredContent: { view: 'none', ...(out.structured || {}) } };
  if (out.map) res._meta = { 'livedot/view': out.map };
  return res;
}

/** One JSON-RPC message → a response object, or null for a notification. */
export async function rpc(msg, env = {}, rq = {}) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg && msg.id, -32600, 'Invalid Request');
  const { id, method, params = {} } = msg, note = id === undefined || id === null;
  try {
    switch (method) {
      case 'initialize': {
        const v = VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0];
        return ok(id, { protocolVersion: v, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
      }
      case 'ping': return note ? null : ok(id, {});
      case 'tools/list': return ok(id, { tools: TOOLS });
      case 'tools/call': {
        const t = TOOLS.find((x) => x.name === params.name);
        if (!t) return err(id, -32602, 'Unknown tool: ' + params.name);
        if (params.arguments != null && (typeof params.arguments !== 'object' || Array.isArray(params.arguments))) return err(id, -32602, 'arguments must be an object');
        const a = params.arguments || {};
        // a required argument left out: say so at once, as a tool error the model can fix (no reads, no sign-in)
        const missing = (t.inputSchema.required || []).filter((k) => a[k] == null || (typeof a[k] === 'string' && !a[k].trim()));
        if (missing.length) return ok(id, { isError: true, content: [{ type: 'text', text: `${t.name} needs ${missing.join(' and ')}.\n\n${await sponsorLineFor(reads(env))}` }], structuredContent: { view: 'none', error: `Missing ${missing.join(', ')}` } });
        let res;
        try { res = await call(params.name, a, params._meta || {}, env, rq); }
        catch (e) {
          if (!(e instanceof NeedAuth)) throw e;
          const challenge = `Bearer resource_metadata="${rq.prm || PRM_URL}", scope="${e.scope}"${e.error ? `, error="${e.error}"` : ''}`;
          // ChatGPT starts its sign-in from a tool result that carries the challenge; other clients from HTTP 401 (MCP authorization)
          const chatgpt = Object.keys(params._meta || {}).some((k) => k.startsWith('openai/')) || /openai|chatgpt/i.test(rq.ua || '');
          if (chatgpt) return ok(id, { isError: true, content: [{ type: 'text', text: `Sign in to your Windline or RunFast account to do this.\n\n${await sponsorLineFor(reads(env))}` }], _meta: { 'mcp/www_authenticate': [challenge] } });
          throw Object.assign(e, { challenge, id });
        }
        return ok(id, res);
      }
      case 'resources/list': return ok(id, { resources: RESOURCES() });
      case 'resources/templates/list': return ok(id, { resourceTemplates: [] });
      case 'resources/read': {
        if (params.uri === GUIDE_URI) return ok(id, { contents: [{ uri: GUIDE_URI, mimeType: 'text/markdown', text: `${GUIDE}\n*${await sponsorLineFor(reads(env))}*\n` }] });
        if (params.uri !== WIDGET_URI) return err(id, -32002, 'Resource not found');
        return ok(id, { contents: [{ uri: WIDGET_URI, mimeType: RESOURCE.mimeType, text: WIDGET_HTML, _meta: RESOURCE_META }] });
      }
      case 'prompts/list': return ok(id, { prompts: promptList() });
      case 'prompts/get': {
        try { const g = promptGet(params.name, params.arguments); return ok(id, { ...g, description: `${g.description} ${await sponsorLineFor(reads(env))}` }); } // the answer carries the sponsor line; the listing doesn't
        catch (e) { return err(id, e.code || -32603, e.message); }
      }
      default:
        if (method.startsWith('notifications/')) return null;
        return note ? null : err(id, -32601, 'Method not found: ' + method);
    }
  } catch (e) {
    if (e instanceof NeedAuth) throw e;
    return note ? null : ok(id, { isError: true, content: [{ type: 'text', text: `livedot couldn't answer just now. Try again in a moment.\n\n${await sponsorLineFor(reads(env)).catch(() => '')}`.trim() }] });
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate', 'Access-Control-Max-Age': '86400',
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
  let body; try { const t = await request.text(); if (t.length > 6e6) return json(err(null, -32600, 'Too large: a GPX file can be up to 5 MB'), 413); body = JSON.parse(t); } catch (e) { return json(err(null, -32700, 'Parse error'), 400); }
  // who's asking: their token (passed on to the app's server, never kept here), and their own address for the route reader's limit
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const rq = { prm: env.MCP_ISSUER ? `${env.MCP_ISSUER}/.well-known/oauth-protected-resource/mcp` : null, authorization: /^Bearer\s+\S+$/.test(request.headers.get('Authorization') || '') ? request.headers.get('Authorization') : null, ua: request.headers.get('User-Agent') || '',
    proxy: env.MCP_PROXY_SECRET && ip ? { 'X-Livedot-Proxy': env.MCP_PROXY_SECRET, 'X-Livedot-Client-Ip': ip } : null };
  const unauthorized = (e) => new Response(JSON.stringify(err(e.id, -32001, e.message)), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'WWW-Authenticate': e.challenge, ...CORS, 'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version' } });
  if (Array.isArray(body)) {
    if (!body.length || body.length > 10) return json(err(null, -32600, 'Invalid Request'), 400);
    try { const out = (await Promise.all(body.map((m) => rpc(m, env, rq)))).filter(Boolean); return out.length ? json(out) : new Response(null, { status: 202, headers: CORS }); }
    catch (e) { if (e instanceof NeedAuth) return unauthorized(e); throw e; }
  }
  try { const out = await rpc(body, env, rq); return out ? json(out) : new Response(null, { status: 202, headers: CORS }); }
  catch (e) { if (e instanceof NeedAuth) return unauthorized(e); throw e; }
}
