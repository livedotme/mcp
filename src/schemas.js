// livedot MCP: what each tool returns as structuredContent (its outputSchema), and the server's prompts.
// The schemas describe what tools.js, eventweather.js and writes.js already return; they stay open (additionalProperties)
// so a new field never breaks a client that checks them. Every answer carries `view`: 'none' when there's nothing to show
// (no match, several matches, a question back), else what it is.

const S = (description) => ({ type: 'string', description });
const SN = (description) => ({ type: ['string', 'null'], description });
const N = (description) => ({ type: 'number', description });
const B = (description) => ({ type: 'boolean', description });
const O = (description) => ({ type: 'object', description });
const A = (description) => ({ type: 'array', description });
const X = (description) => ({ description }); // shape set by the app's own server

const COMMON = {
  sponsor_line: S('The line every answer ends with: who brings livedot\'s live tracking free.'),
  message: S('When view is "none": what to tell the user (no match, not live yet, a question back).'),
  error: S('When the call failed: what went wrong, in words for the user.'),
  signup: X('Without a sign-in: { label, url } to make a free Windline or RunFast account (?ref=mcp).'),
};
const out = (views, properties, description) => ({
  type: 'object',
  description,
  properties: { view: { type: 'string', enum: [...views, 'none'], description: 'What this answer is; "none" when there is nothing to show (see message).' }, ...properties, ...COMMON },
  required: ['view'],
  additionalProperties: true,
});

const PERSON = {
  id: S('The person id to pass to where_is ("h:<handle>", "<app>:f:<code>" or "<app>:p:<id>").'),
  name: S('Their name as the public live page shows it.'),
  app: { type: 'string', enum: ['windline', 'runfast'], description: 'windline (cycling) or runfast (running).' },
  sport: S('cycling or running.'),
  status: S('live, delayed, nosignal, paused, waiting, finished or stopped.'),
  race: SN('The race they are in, or null for a ride of their own.'),
  follow_url: S('The public Follow live link.'),
  units: { type: 'string', enum: ['metric', 'imperial'], description: 'The units the text answer uses.' },
  position: O('Only when the public live page shows where they are: km, mile, of_km, percent, seen (ISO time).'),
  goal: O('Their goal time and how far behind (positive) or ahead (negative) of it they are, in seconds.'),
  pace: O('Running: per_km_s; cycling: kmh; with words.'),
  conditions: O('The weather where they are: temp_c, feels_c, wind_kmh, gust_kmh, wind_from_deg, along_road_kmh, effect (head, tail, cross, calm), rain_mm_h.'),
  ahead: A('The next stretches of the course: from_km, to_km, at (ISO), temp_c, effect, along_road_kmh, wind_kmh (running: heat_stress).'),
  road_ahead: O('The Windline forecast engine\'s rating of the road ahead: rating (good, fair, tough), why.'),
  forecast_updated: S('When the forecast was fetched (ISO).'),
  finished: O('When they have finished: time (h:mm:ss) and at (ISO).'),
  eta: O('The finish time their pace points to: at (ISO), local, tz.'),
  total: S('Several matches: how many ("24", or "20+" when capped).'),
  capped: B('Several matches: true when there are more than the count shows.'),
  people: A('Several matches: the 5 most likely, each with id, name, sport, race, status, where, pace, goal, bib, club. Ask the user to pick; never guess.'),
};
const EVENT_WEATHER = {
  event: SN('The event\'s name.'),
  sport: S('cycling or running.'),
  basis: { type: 'string', enum: ['forecast', 'historic', 'mixed'], description: 'forecast (Apple Weather, within 10 days), historic (10 years of Copernicus ERA5 on that date) or mixed.' },
  timed_for: SN('What the times assume (the start, the pace).'),
  url: SN('The event\'s page.'),
  units: { type: 'string', enum: ['metric', 'imperial'] },
  days: A('Each day: name, date (ISO), basis, rating (good, fair, tough), why, start_temp_c, finish_temp_c, effort_pct (cycling), heat_stress and wbgt_c (running), rain_mm or rain_days_in_10 and usual_high_c.'),
  events: A('Several events matched: their names. Ask the user which one.'),
};

export const OUTPUT_SCHEMAS = {
  find_person: out(['person', 'picker'], PERSON, 'One match: the person\'s live answer (view "person"). Several: the 5 most likely (view "picker").'),
  where_is: out(['person'], PERSON, 'The person\'s live answer: where they are, time against their goal, the finish it points to and the weather there.'),
  event_status: out(['event'], {
    name: SN('The race\'s name.'), app: { type: 'string', enum: ['windline', 'runfast'] }, sport: S('cycling or running.'),
    started: SN('When it got under way (ISO).'), on_map: X('How many people are on livedot\'s map.'), finished: N('How many have finished.'),
    leaders: A('The leaders the public race map shows: name, and finished (time) or km and where (null km near the start or finish).'),
    url: SN('The race\'s live page.'), units: { type: 'string', enum: ['metric', 'imperial'] },
    upcoming: A('Not live yet: upcoming races with name, start, url.'), races: A('Several races matched: name, app, people. Ask which one.'),
  }, 'How a live race is going.'),
  event_weather: out(['event_weather'], EVENT_WEATHER, 'The weather for an event along its course, rated by the Windline forecast engine.'),
  fly_route: out(['fly_route'], { ...EVENT_WEATHER, fly_url: S('Fly it in 3D.'), km: N('The course\'s length in km.') }, 'A flyover of the course, with the weather along it.'),
  tour_route: out(['tour_route'], {
    tour: SN('The tour\'s name.'), url: SN('The tour\'s page.'), route_files: B('Whether the organiser lets riders download the route files.'),
    gpx: A('When route_files: each day\'s GPX link (day, url). Never make one up.'),
    days: A('Each day: label, from, to, km, climb_m, start (ISO), and its weather.'), tours: A('Several tours matched: their names. Ask which one.'),
  }, 'A Windline cycling tour\'s route, day by day.'),
  tour_notes: out(['tour_notes'], {
    beta: B('tour_notes is in beta.'), tour: SN('The tour\'s name.'), notes: SN('The organiser\'s notes for riders, in their words (markdown); null when there are none.'),
    notes_updated: SN('When the notes last changed (ISO).'), url: SN('The tour\'s page.'), tours: A('Several tours matched: their names. Ask which one.'),
  }, 'A cycling tour\'s notes for riders, as the organiser wrote them.'),
  plan_route: out(['plan_route'], { ...EVENT_WEATHER, tz: S('The route\'s IANA time zone.'), km: N('The route\'s length in km.'), order: X('Several files: how the days were ordered (numbers, map or upload).'), order_note: X('When the file numbers and the map disagree: what was chosen.'), files: X('Several files: the file of each day, in order.') }, 'The weather along a route at the time you\'d ride or run it.'),
};
const WRITE = (views, description) => out(views, {
  app: SN('The account\'s app: windline or runfast.'),
  events: X('list_my_events: each event with id, name, status (draft or published), dates, km, finished, and its dashboard and public links.'),
  id: X('The event\'s id.'), status: X('draft, published, or private.'), visibility: X('private (just for them) or shared (for a group).'), link: X('A private event: its private link (Windline) or where the app opens it (RunFast).'),
  pages: X('list_my_events on Windline: the club and organiser pages they run ({ slug, name, type }). Ask who a new ride is for when there are any.'), clubs: X('list_my_events on RunFast: the clubs they run ({ slug, name }).'),
  order: X('The plan (view tour_plan): how the days were ordered.'), note: X('The plan: when the file numbers and the map disagree.'), days: X('The plan: each day with its file, from, to, km, climbing and start.'), dashboard: X('The organiser\'s dashboard link.'), url: X('The public link, once published.'),
}, description);
Object.assign(OUTPUT_SCHEMAS, {
  list_my_events: WRITE(['my_events'], 'The signed-in organiser\'s events.'),
  create_event: WRITE(['created', 'tour_plan'], 'The plan to check with the user (view tour_plan, nothing made yet), or the new event and its links.'),
  update_event: WRITE(['update_event'], 'What changed on the event.'),
  add_tour_notes: WRITE(['add_tour_notes'], 'The tour\'s notes, saved.'),
  publish_event: WRITE(['publish_event'], 'The event, now public, and its link.'),
  post_club_ride: WRITE(['club_ride'], 'The club ride, posted on the club\'s page.'),
});

// ---------------------------------------------------------------- prompts: the three things people ask most, ready to pick
export const PROMPTS = [
  {
    name: 'track_someone',
    title: 'Track someone in a race',
    description: 'Where someone is in a live cycling or running race right now, the weather they\'re in, and when they\'ll finish, with a live map.',
    arguments: [
      { name: 'person', description: 'Their name or livedot handle, e.g. "Megan" or "@megan".', required: true },
      { name: 'race', description: 'The race, if you know it, e.g. "Comrades".', required: false },
    ],
    text: (a) => `Where's ${a.person}${a.race ? ` in the ${String(a.race).replace(/^the /i, '')}` : ''} right now? Show me where they are, how they're doing against their goal, when they'll finish and the weather where they are.`,
  },
  {
    name: 'race_day_weather',
    title: 'Race-day weather',
    description: 'What the weather will be like along an event\'s course on race day: the forecast within 10 days, 10 years of weather on that date beyond it.',
    arguments: [
      { name: 'event', description: 'The event, e.g. "NYC Marathon", "Gravel Burn", "Comrades demo".', required: true },
      { name: 'year', description: 'The edition\'s year, if not the next one.', required: false },
    ],
    text: (a) => `What will the weather be like for the ${String(a.event).replace(/^the /i, '')}${a.year ? ` ${a.year}` : ''}? Where on the course is the headwind or tailwind, the heat and the rain?`,
  },
  {
    name: 'fly_a_course',
    title: 'Fly a course',
    description: 'Fly over a race course in the chat, coloured by the weather along it.',
    arguments: [{ name: 'event', description: 'The event or route, e.g. "Comrades", "NYC Marathon".', required: true }],
    text: (a) => `Fly the ${String(a.event).replace(/^the /i, '')} course and show me the weather along it.`,
  },
];
export const promptList = () => PROMPTS.map(({ text, ...p }) => p);
/** prompts/get: the prompt's message, or an Error (with .code) for an unknown prompt or a missing argument. */
export function promptGet(name, args) {
  const p = PROMPTS.find((x) => x.name === name);
  if (!p) throw Object.assign(new Error('Unknown prompt: ' + name), { code: -32602 });
  const a = args && typeof args === 'object' ? args : {};
  const missing = p.arguments.filter((x) => x.required && !String(a[x.name] || '').trim()).map((x) => x.name);
  if (missing.length) throw Object.assign(new Error('Missing argument: ' + missing.join(', ')), { code: -32602 });
  const clean = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v).trim().slice(0, 200)]));
  return { description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text(clean) } }] };
}
