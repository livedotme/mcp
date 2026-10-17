<div align="center">

<img src="assets/icon.svg" width="72" height="72" alt="livedot">

# livedot MCP

**Live race tracking, in ChatGPT and Claude.**

Ask where someone is in a race, how it's going, or what race day will be like, and get the answer with a live map in the chat.

[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-me.livedot%2Fmcp-0B1B2B)](https://registry.modelcontextprotocol.io/v0/servers?search=me.livedot)
[![Smithery](https://img.shields.io/badge/Smithery-livedot-2FD39B)](https://smithery.ai/server/livedot)
[![Glama](https://img.shields.io/badge/Glama-livedot%20MCP-635BFF)](https://glama.ai/mcp/servers)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B1B2B)](LICENSE)

`https://livedot.me/mcp` · free · no sign-in · read-only

</div>

<table>
<tr>
<td width="50%"><b>“Where’s Megan in the Comrades?”</b><br><img src="docs/shots/picker-widget.png" alt="A picker in the chat: 20+ Megans in the Comrades, each with the km they're at, their pace and their goal, and a search box"></td>
<td width="50%"><b>“The one with livedot.me/megan.”</b><br><img src="docs/shots/picker-to-map-widget.png" alt="Megan's live map: her dot on the Comrades course, coloured by how hard the heat makes each stretch, with her pace, finish time and the road ahead"></td>
</tr>
</table>

<!-- GIF slot (10–15 s): docs/demo.gif — the question typed, the picker, a tap, the live map, then "Fly the Comrades" playing. -->

## Try it in 30 seconds

The server URL is `https://livedot.me/mcp` (Streamable HTTP). No key, no account, no headers.

**ChatGPT**
1. **Settings → Apps & Connectors → Advanced settings**: turn on **Developer mode**.
2. **Create**: name `livedot`, MCP server URL `https://livedot.me/mcp`, authentication **No authentication**.
3. Ask: *“Where’s the demo runner in the Comrades demo?”*

**Claude** (web and desktop)
1. **Settings → Connectors → Add custom connector**.
2. Name `livedot`, URL `https://livedot.me/mcp`.
3. Ask: *“Fly the Comrades.”*

**Claude Code**
```bash
claude mcp add --transport http livedot https://livedot.me/mcp
```

**Cursor** (`~/.cursor/mcp.json`)
```json
{ "mcpServers": { "livedot": { "url": "https://livedot.me/mcp" } } }
```

Any other MCP client: point it at `https://livedot.me/mcp`.

## What you can ask

Real answers, word for word, on sample data and the apps' demo races.

**“Where’s Megan in the Comrades?”** (`find_person`, then `where_is`)
> I found 20+ Megans in the Comrades. Here are the 5 most likely:
> 1. Megan N. (livedot.me/megan), km 58, 6:20 /km, 18 min behind goal
> 2. Megan B., km 61, 5:58 /km
> 3. Megan N., km 66, 5:32 /km
> …

> Megan N. is at km 58 (mile 36) of 90 km (56 mi) in the Comrades, 18 minutes behind the goal (9:00:00). Running at 6:20 /km (10:12 /mi). Where Megan is: 31°C (88°F), calm air at 5 km/h (3 mph), rated very hard (heat stress Extreme). The road ahead (km 57–69) rates Tough: Heat stress Extreme from km 57 (WBGT up to 32°) · Weather costs about 9 min (heat and humidity, from km 57). At this pace Megan finishes around 11:43 race time.
> Follow live: https://livedot.me/megan
>
> Live tracking, proudly brought to you free thanks to ProLend.

**“Fly the Comrades”** (`fly_route`)
> Here's the Comrades Marathon (demo) course from the air: 90 km (56 mi), with the weather along it. Press play on the map to fly it. … Rated Tough (Heat stress High from km 12, Extreme from 30 (WBGT up to 31°)). About 20°C (68°F) at the start and 27°C (81°F) at the finish. …
> Fly it in 3D: https://runfast.tech/live/race/comrades-demo

<img src="docs/shots/fly-comrades-widget.png" width="640" alt="A flyover of the Comrades course in the chat, the camera following the road, coloured by how hard the heat makes each stretch">

**“What will the weather be like for the NYC Marathon?”** (`event_weather`)
> TCS New York City Marathon 2026: Sunday 1 November 2026, start 10:20 AM. Based on 10 years of weather on this date (Copernicus ERA5, 2015–2024), not a forecast. Rated Good. About 55°F (13°C) at the start and 58°F (14°C) at the finish. Heat stress Low. Rain on about 3 days in 10. …
> More: https://livedot.me/guides/nyc-marathon-2026-weather/

**“What’s the ProLend 2027 Durban Tour route? Give me the GPX files.”** (`tour_route`)
> ProLend 2027 Durban Tour: 6 days, 771 km (479 mi).
> Day 1: Johannesburg to Villiers, 164 km (102 mi), 1,185 m of climbing, start 6:00.
> …
> Day 6: Greytown to Ballito, 134 km (83 mi), 1,883 m of climbing, start 6:00.
> The organiser hasn't made the route files available.

<img src="docs/shots/tour-route-widget.png" width="640" alt="A cycling tour's days on a map, each rated for the weather, with a Route files button">

**More to try:** *“How’s the Coast Classic demo going?”* · *“Is Thandi racing?”* · *“Weather for the Gravel Burn?”* · *“What should I pack for the Durban tour?”*

## Tools

| Tool | What it does |
|---|---|
| `find_person` | Finds someone racing live by name, livedot handle (`@megan`, `livedot.me/megan`) or follow link. One clear match answers at once. Several become a picker ranked live first, then the handle's owner, name closeness and taps on the back; the assistant asks one short question and never guesses. Narrow with `event`, `surname`, `bib`, `club`, `place`, `wave`. |
| `where_is` | Where someone is now: km and mile, time against their goal, pace, finish time, the temperature and wind there with the engine's rating, the next few km of wind and heat, and Follow live. |
| `event_status` | How a live race is going: how long it's been under way, how many are on the map, how many finished, who's in front. |
| `event_weather` | Race-day weather along the course at the times people get there. Inside 10 days, the live forecast; beyond, 10 years of weather on the date, labelled as history. |
| `fly_route` | A flyover of the course in the chat, coloured by the weather along it, with **Fly it in 3D**. |
| `tour_route` | A Windline cycling tour by name or organiser: every day (from and to, distance, climbing, start time), the map and the weather. A GPX link for each day only when the organiser shares route files; otherwise it says so. |
| `tour_notes` | *Beta.* A tour organiser's own notes for riders (what to pack, meeting points), quoted in their words. |

Every tool takes `units`: `metric` or `imperial`. Without it, the asker's region decides (ChatGPT sends it); with neither, the event's country leads and the other system follows in brackets: “km 79 (mile 49)”. All tools are read-only (`readOnlyHint`).

## How it works

- **Live, from the apps.** Positions, goals and finish times come from [Windline](https://windline.tech) (cycling) and [RunFast](https://runfast.tech) (running): the same public live pages anyone can open on [livedot.me](https://livedot.me).
- **One forecast engine.** Weather by the Windline engine, served from livedot.me: the same engine as the apps and every livedot page, so the numbers match everywhere. Apple Weather for the next 10 days; 10 years of Copernicus ERA5 records beyond. The engine is Windline's and isn't in this repository or under its licence: `scripts/build.mjs` fetches it from `windline.tech/engine-core.js` when the server is built.
- **A map in the chat.** One [MCP Apps](https://modelcontextprotocol.io) UI resource (`ui://livedot/live-map.html`) that Claude and ChatGPT render inline: always a light map (OpenFreeMap), never a per-tile map key. Clients without widgets get the full answer as text.

**Privacy.** Only people who chose to be findable, on public races; no position when someone has stopped or is near the start or finish; names as “Megan N.”; nothing kept about who asked.

## For the auditor

A position (km, mile, map dot, the weather there) is shared only when the public follow answer gives one and the person is moving (live, delayed, no signal). Paused, stopped, not started, hidden near the start or finish, private or not shared: “I can't share where they are right now.” Route files only when the organiser's own switch (`routeFiles`) is on. Every read is in `src/reads.js`.

## Develop

```bash
node scripts/build.mjs                 # fetch the engine, build the widget and the event list
node test/smoke.mjs                    # every tool, on sample data and the apps' public demos
node test/fixture-api.mjs              # sample data on :8790
npx @modelcontextprotocol/inspector    # connect to your server's /mcp (Streamable HTTP)
MCP=http://localhost:8788/mcp node test/shots.mjs   # the screenshots in docs/shots, at 3x
```

`src/server.js` is the whole server (`handle(request, env)`); on livedot.me it runs as a Cloudflare Pages Function.

## Keywords

Live tracking · race tracker · marathon tracker · cycling race tracking · Comrades tracker · marathon weather · race-day weather forecast · cycling tour GPX · ChatGPT app · Claude connector · MCP server · Model Context Protocol

## Links

[livedot.me](https://livedot.me) · [windline.tech](https://windline.tech) (cycling) · [runfast.tech](https://runfast.tech) (running) · [Privacy](https://livedot.me/privacy) · [Terms](https://livedot.me/terms) · hello@windline.tech

*Live tracking, proudly brought to you free thanks to ProLend.*

MIT licensed. The Windline forecast engine is not part of this repository.
