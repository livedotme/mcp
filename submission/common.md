# Shared copy

- **Name:** livedot MCP (display name in apps: **livedot**)
- **Server URL:** `https://livedot.me/mcp` · Streamable HTTP · asking needs no sign-in; organisers sign in with OAuth for their own events
- **Website:** https://livedot.me/mcp
- **Repository:** https://github.com/livedotme/mcp
- **Privacy policy:** https://livedot.me/privacy
- **Terms:** https://livedot.me/terms
- **Support / contact:** hello@windline.tech
- **Category:** Sports (else Lifestyle / Travel)
- **Logo:** `logos/livedot.svg`; PNG at 1024, 512, 256, 128 and 64 px (`logos/livedot-<size>.png`)

**Tagline (≤ 60):** Live race tracking, in ChatGPT and Claude.

**Short description (≤ 100):** Where someone is in a live race, the weather on the course, and race-day forecasts, with a live map.

**Description (long):**
livedot brings live race tracking into the chat. Ask "Where's Megan in the Comrades?" and get her km, her time against her goal, her finish time and the weather where she is, with a live map: the course, her dot, and the wind and heat on the road ahead. When a name fits many people, livedot shows the likeliest few and asks one short question instead of guessing.

It also answers before race day: what the weather will be like along the course at the times riders and runners get there (the live forecast inside 10 days, 10 years of weather on the date beyond), a flyover of the course, and a Windline cycling tour's days, with the route files when the organiser shares them.

livedot covers cycling races on Windline and running races on RunFast. The weather comes from Windline's forecast engine, the same as the apps. Read-only, free, no sign-in. Only people who chose to be findable, on public races, are shown, and no position is shared when someone has stopped or is near the start or finish.

**Tools:** find_person, where_is, event_status, event_weather, fly_route, tour_route, tour_notes (beta), find_clubs, find_events, find_coaches, plan_route: read-only, no sign-in. For organisers, with OAuth 2.1 (PKCE, dynamic client registration; Windline or RunFast account): list_my_events (read-only), create_event (drafts), update_event, add_tour_notes, publish_event (asks to confirm), post_club_ride, annotated honestly (`destructiveHint: true` on update, notes and publish).

**Authentication (for the forms):** OAuth 2.1, authorization code with PKCE (S256), dynamic client registration at `https://livedot.me/oauth/register`; metadata at `https://livedot.me/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`. Read tools need no sign-in. **Reviewers need a test account** for the organiser tools: the PM makes one Windline and one RunFast reviewer account (never in any file) and pastes them into the form.

**Keywords:** live tracking, race tracker, marathon tracker, cycling, running, Comrades, marathon weather, race-day weather, cycling tour GPX, flyover

## Test prompts and expected answers (18 Oct, as production answers today)

These use the apps' demo races (always live while `config/demo.listed` is on) and published data, so they work any day.

1. **"Where's Megan in the Comrades?"** → `find_person`. Several Megans: the 5 likeliest and one short question. Pick **Megan Naidoo** → her live card: km of 90, time against her goal, finish time, the heat there and on the road ahead, "ProLend Cycling Club · Coach Nadia Pillay" under her name, Follow live, and **Give Megan a tap on the back**.
2. **"How are Coach Nadia's runners doing in the Comrades?"** → `club_in_race` (coach). Her 8 runners on one map (hover a dot for the name, tap for their card), on the course / finished / out front.
3. **"Cycling clubs in the Johannesburg area"** → `find_clubs`. ProLend Cycling Club, its rides and the weather for the next one.
4. **"Coaches near Fourways"** → `find_coaches`. Coach Sipho Dlamini (demo): what he coaches and how, the next group session with its weather, Book / contact.
5. **"What's the weather along this ride on Saturday at 6am? https://windline.tech/api/event/tour/tsf-2026/day/5.gpx"** → `plan_route`. The weather along the route timed to a rider at 25 km/h, a rating, and a flyover in the chat.
6. **"Fly the Comrades"** → `fly_route`. The course from the air, coloured by the weather.
7. **"Where's Zebedee Quux in the Comrades?"** → `find_person`. An honest "couldn't find anyone" with how to follow someone by their livedot link.
8. **Signed in with the reviewer account: "Show my events"** → `list_my_events`; **"Make this a private ride: <the link in 5>"** → `create_event` returns the plan first, then a draft on a yes. Nothing is published without a yes.

**Note:** the demo races are the apps' own and stay on unless HQ switches them off (`config/demo`). Keep them on while a review is open.
