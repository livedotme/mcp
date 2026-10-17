# Shared copy

- **Name:** livedot MCP (display name in apps: **livedot**)
- **Server URL:** `https://livedot.me/mcp` · Streamable HTTP · no authentication · read-only
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

**Tools:** find_person, where_is, event_status, event_weather, fly_route, tour_route, tour_notes (beta). All read-only (`readOnlyHint: true`, `destructiveHint: false`).

**Keywords:** live tracking, race tracker, marathon tracker, cycling, running, Comrades, marathon weather, race-day weather, cycling tour GPX, flyover

## Test prompts and expected answers

These use the apps' demo races (always live) and published data, so they work any day.

1. **"Where's the demo runner in the Comrades demo?"** → `find_person`. One person, Megan N. (demo), answered at once: "Megan N. (demo) is at km … of 90 km in the Comrades (demo) … Where Megan is: …° … At this pace Megan finishes around …", a Follow live link, the live map (course, dot, the heat along it), ending "Live tracking, proudly brought to you free thanks to ProLend."
2. **"How's the Coast Classic demo going?"** → `event_status`. "Coast Classic (demo) is live: under way for … 150 riders on livedot's map. Out front: … Leaders on the public map: …", the race map with the leaders' dots, Watch the race.
3. **"Fly the Comrades"** → `fly_route`. "Here's the Comrades Marathon (demo) course from the air: 90 km (56 mi), with the weather along it." The widget flies the course; Fly it in 3D and Open on livedot.
4. **"What will the weather be like for the NYC Marathon?"** → `event_weather`. Before 22 Oct 2026: "Based on 10 years of weather on this date (Copernicus ERA5, 2015–2024), not a forecast. Rated Good …" From 22 Oct: "Forecast from Apple Weather, timed to the course." Links to livedot.me/guides/nyc-marathon-2026-weather/.
5. **"What's the ProLend 2027 Durban Tour route? Give me the GPX files."** → `tour_route`. "ProLend 2027 Durban Tour: 6 days, 771 km (479 mi). Day 1: Johannesburg to Villiers, 164 km …" and "The organiser hasn't made the route files available." (no file link is made up).
6. **"Where's Zebedee Quux in the Comrades?"** → `find_person`. An honest "I couldn't find anyone called … who is findable on a live race", with how to follow someone by their livedot link.

**Note:** the demo races are the apps' own and stay on unless HQ switches them off (`config/demo`). Keep them on while a review is open.
