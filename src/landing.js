// livedot.me/mcp in a browser: what livedot MCP is, how to add it to ChatGPT, Claude, Claude Code and Cursor, and what to ask.
// Indexable on livedot.me (noindex anywhere else: the preview). The same address answers MCP clients (POST): server.js decides.
const IMG = '/img/mcp/'; // the site's own images (public/img/mcp), so the preview shows them too
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const EXAMPLES = [
  { q: 'Where’s Megan in the Comrades?', a: 'I found 20+ Megans in the Comrades. Here are the 5 most likely. Which one: do you know her surname?', img: 'picker', alt: 'A picker in the chat: Megans in the Comrades, each with the km they’re at, their pace and their goal, and a search box' },
  { q: '“The one with livedot.me/megan.”', a: 'Megan N. is at km 58 of 90, 18 minutes behind her 9:00 goal, running 6:20 per km. Where she is: 31°, calm, rated very hard for the heat. At this pace she finishes around 11:43. Follow live: livedot.me/megan', img: 'picker-to-map', alt: 'Megan’s live map: the course coloured by how hard the weather makes it, her dot at km 58, her goal, pace, finish time and the road ahead' },
  { q: 'Fly the Comrades', a: 'Here’s the course from the air, 90 km, coloured by how hard the heat makes each stretch at a runner’s pace. Press play to fly it, or Fly it in 3D.', img: 'fly-comrades', alt: 'A flyover of the Comrades course in the chat, the camera following the road with the heat along it' },
  { q: 'What will the weather be like for the Comrades?', a: 'Rated Tough: heat stress High from km 12 and Extreme from km 30, about 20° at the start and 27° at the finish. The forecast inside 10 days; 10 years of weather on the date beyond.', img: 'weather-forecast', alt: 'Race-day weather for the Comrades: the course coloured by the heat, the start time, temperatures, heat stress and rain' },
  { q: 'What’s Alistair’s Durban Tour 2027 route? Give me the GPX files.', a: 'Two days, 95 km: Pietermaritzburg to Hillcrest, then Hillcrest to Durban, with the climbing, start times and 10 years of weather on the dates. The organiser shares the route files: a GPX link for each day.', img: 'tour-route', alt: 'A cycling tour’s two days on a map, each rated for the weather, with a Route files button' },
];
const TOOLS = [
  ['find_person', 'Finds someone live (in a race, or on a ride or run of their own) by name, livedot handle or follow link. One clear match answers at once; several become a picker, and the assistant asks one short question instead of guessing.'],
  ['where_is', 'Where they are now: km and mile, time against their goal, pace, finish time, the weather there and on the road ahead, and Follow live.'],
  ['event_status', 'How a live race is going: how long it’s been under way, how many are out, who’s in front.'],
  ['club_in_race', 'How a club or team is doing in a live race: each of its people on the club’s public live map, with km and goal time; tap a face for their card.'],
  ['event_weather', 'Race-day weather along the course at the times people get there: the live forecast inside 10 days, 10 years of weather on the date beyond.'],
  ['fly_route', 'A flyover of the course in the chat, coloured by the weather along it, with Fly it in 3D.'],
  ['tour_route', 'A Windline cycling tour, day by day, with the weather, a flyover of any day, and a GPX link for each day when the organiser shares route files.'],
  ['tour_notes', 'Beta: a tour organiser’s own notes for riders (what to pack, meeting points), quoted in their words.'],
  ['find_clubs', 'Running and cycling clubs near a place, nearest first: their weekly sessions, Beginners welcome, Open to anyone, pace groups, the next session with its weather, the club’s own links, and Join to the club’s page.'],
  ['find_events', 'Rides, runs, races and tours near a place and when, soonest first, with the weather (the forecast inside 10 days, typical beyond) and I’m in to the event’s page.'],
  ['plan_route', 'The weather along your own route (a GPX file or a Ride with GPS link) at the time you’ll ride or run it.'],
  ['create_event', 'Organisers, signed in with Windline or RunFast: a draft event from your GPX files. Also list_my_events, update_event, add_tour_notes, publish_event (only when you confirm) and post_club_ride.'],
];

export function landing(host, sponsorName = 'ProLend') {
  const canonical = 'https://livedot.me/mcp', index = host === 'livedot.me';
  const ld = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'livedot MCP', applicationCategory: 'SportsApplication', operatingSystem: 'ChatGPT, Claude, any MCP client',
    url: canonical, description: 'Ask ChatGPT or Claude where someone is in a live race, how a race is going, or what the weather will be like on race day, with a live map in the chat.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@type': 'Organization', name: 'livedot', url: 'https://livedot.me' }, sameAs: ['https://github.com/livedotme/mcp'] };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>livedot MCP: live race tracking in ChatGPT and Claude</title>
<meta name="description" content="Ask ChatGPT or Claude where someone is in a race, how it’s going, or what race-day weather will be like, and get a live map in the chat. Free MCP server for cycling and running: livedot.me/mcp.">
<link rel="canonical" href="${canonical}">${index ? '' : '\n<meta name="robots" content="noindex">'}
<meta property="og:type" content="website"><meta property="og:url" content="${canonical}"><meta property="og:title" content="livedot MCP: live race tracking in ChatGPT and Claude">
<meta property="og:description" content="Where’s Megan in the Comrades? Ask, and get the answer with a live map in the chat."><meta property="og:image" content="https://livedot.me/img/mcp/person-handle.jpg">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0B1B2B">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;800&display=swap">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{--navy:#0B1B2B;--live:#2FD39B;--live-ink:#0A7A54;--ground:#F6F8FA;--paper:#fff;--ink:#0B1B2B;--body:#3B4A5A;--muted:#5F6E7E;--line:rgba(11,27,43,.09);--cyc:#635BFF;--run:#EE7A1F;
  --font:"Schibsted Grotesk",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--sh:0 2px 6px rgba(11,27,43,.06),0 30px 60px -30px rgba(11,27,43,.35);color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#07111B;--paper:#0E1C2B;--ink:#EEF3F8;--body:#B5C2CF;--muted:#8697A8;--line:rgba(255,255,255,.08);--live-ink:#2FD39B;--sh:0 1px 0 rgba(255,255,255,.04) inset,0 30px 60px -30px rgba(0,0,0,.85);color-scheme:dark}}
:root[data-theme="dark"]{--ground:#07111B;--paper:#0E1C2B;--ink:#EEF3F8;--body:#B5C2CF;--muted:#8697A8;--line:rgba(255,255,255,.08);--live-ink:#2FD39B;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:400 16px/1.6 var(--font);-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--ground) 86%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.wm{display:flex;align-items:center;gap:10px;text-decoration:none;font:800 20px/1 var(--font);letter-spacing:-.035em}.wm svg{width:28px;height:28px}
nav a{font:600 14px/1 var(--font);text-decoration:none;color:var(--muted);margin-left:20px}nav a:hover{color:var(--ink)}
.hero{padding:72px 16px 40px;display:grid;grid-template-columns:1.05fr 1fr;gap:48px;align-items:center}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font:600 13px/1 var(--font);color:var(--live-ink);background:rgba(47,211,155,.14);padding:7px 12px;border-radius:99px}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:var(--live)}
h1{font:800 clamp(38px,5.4vw,62px)/1.04 var(--font);letter-spacing:-.035em;margin:18px 0 18px}
.lead{font-size:clamp(17px,1.5vw,20px);color:var(--body);max-width:34ch;margin:0 0 28px}
.cta{display:flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-flex;align-items:center;gap:9px;height:46px;padding:0 20px;border-radius:12px;background:var(--navy);color:#fff;text-decoration:none;font:600 15px/1 var(--font);box-shadow:0 1px 2px rgba(11,27,43,.2)}
.btn.ghost{background:var(--paper);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
:root[data-theme="dark"] .btn:not(.ghost){background:#fff;color:#0B1B2B}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .btn:not(.ghost){background:#fff;color:#0B1B2B}}
.endpoint{margin-top:22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font:600 14px/1 var(--font);color:var(--muted)}
.endpoint code{font:600 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--paper);color:var(--ink);padding:10px 12px;border-radius:10px;box-shadow:inset 0 0 0 1px var(--line)}
.shot{border-radius:18px;box-shadow:var(--sh);overflow:hidden;background:var(--paper);border:1px solid var(--line)}
.shot img{display:block;width:100%;height:auto}
.chat{display:grid;gap:12px}
.me{justify-self:end;background:var(--navy);color:#fff;padding:10px 14px;border-radius:16px 16px 4px 16px;font-weight:600;max-width:90%}
section{padding:56px 0;border-top:1px solid var(--line)}
h2{font:800 clamp(28px,3.2vw,40px)/1.1 var(--font);letter-spacing:-.035em;margin:0 0 10px}
.sub{color:var(--body);margin:0 0 32px;max-width:60ch}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:20px}
.card h3{font:800 18px/1.2 var(--font);letter-spacing:-.02em;margin:0 0 10px}.card ol{margin:0;padding-left:20px;color:var(--body);font-size:15px}.card li{margin:4px 0}
.card code{font:600 13px/1.4 ui-monospace,Menlo,monospace;word-break:break-all;background:var(--ground);padding:2px 5px;border-radius:6px}
.ex{display:grid;grid-template-columns:1fr 1.15fr;gap:36px;align-items:center;margin:0 0 56px}.ex:nth-child(even) .txt{order:2}
.ex .q{font:800 24px/1.2 var(--font);letter-spacing:-.025em;margin:0 0 10px}.ex .a{color:var(--body);margin:0}
.tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.tools div{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px}.tools code{font:700 14px/1 ui-monospace,Menlo,monospace;color:var(--cyc)}.tools p{margin:6px 0 0;color:var(--body);font-size:15px}
.how{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}.how b{display:block;font:800 17px/1.25 var(--font);margin-bottom:4px}.how p{margin:0;color:var(--body);font-size:15px}
footer{padding:40px 0 56px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
footer .sp{color:var(--ink);font-weight:600;margin:0 0 14px}footer nav a{margin:0 18px 0 0}
@media (max-width:860px){.hero{grid-template-columns:1fr;padding-top:40px}.ex{grid-template-columns:1fr;gap:16px}.ex:nth-child(even) .txt{order:0}nav a.hide{display:none}}
</style>
</head>
<body>
<header class="top"><div class="wrap"><a class="wm" href="https://livedot.me/" aria-label="livedot, home"><svg viewBox="20 20 60 60" aria-hidden="true"><circle cx="50" cy="50" r="26" fill="none" stroke="#2FD39B" stroke-width="5" stroke-linecap="round" stroke-dasharray="128 35.4" transform="rotate(-20 50 50)" opacity=".55"/><circle cx="50" cy="50" r="13" fill="#2FD39B"/></svg>livedot</a>
<nav aria-label="On this page"><a href="#add">Add it</a><a class="hide" href="#ask">What to ask</a><a class="hide" href="#tools">Tools</a><a href="https://github.com/livedotme/mcp">GitHub</a></nav></div></header>
<main>
<div class="wrap hero">
  <div>
    <span class="eyebrow"><i></i>MCP server · free · no sign-in</span>
    <h1>Live race tracking, in ChatGPT and Claude.</h1>
    <p class="lead">Ask where someone is in a race and get the answer with a live map in the chat: their km, their goal, when they’ll finish and the weather on the road ahead.</p>
    <div class="cta"><a class="btn" href="#add">Add to ChatGPT</a><a class="btn ghost" href="#add">Add to Claude</a></div>
    <div class="endpoint">Server URL <code>https://livedot.me/mcp</code></div>
  </div>
  <div class="chat"><span class="me">Where’s Megan in the Comrades?</span><div class="shot"><img src="${IMG}person-handle.jpg" width="1520" height="1390" alt="Megan’s live map in the chat: her dot on the Comrades course, coloured by how hard the heat makes each stretch, with her pace, finish time and the road ahead"></div></div>
</div>

<section id="add"><div class="wrap">
  <h2>Try it in 30 seconds</h2>
  <p class="sub">One URL, no key, no account: <code>https://livedot.me/mcp</code> (Streamable HTTP).</p>
  <div class="steps">
    <div class="card"><h3>ChatGPT</h3><ol><li>Settings → Apps &amp; Connectors → Advanced settings: turn on Developer mode.</li><li>Create, name it <b>livedot</b>, URL <code>https://livedot.me/mcp</code>, No authentication.</li><li>Ask: “Where’s the demo runner in the Comrades demo?”</li></ol></div>
    <div class="card"><h3>Claude</h3><ol><li>Settings → Connectors → Add custom connector.</li><li>Name <b>livedot</b>, URL <code>https://livedot.me/mcp</code>.</li><li>Ask: “Fly the Comrades.”</li></ol></div>
    <div class="card"><h3>Claude Code</h3><ol><li>Run <code>claude mcp add --transport http livedot https://livedot.me/mcp</code></li><li>Ask: “How’s the Coast Classic demo going?”</li></ol></div>
    <div class="card"><h3>Cursor</h3><ol><li>Settings → MCP → Add new MCP server.</li><li>Add <code>{"livedot":{"url":"https://livedot.me/mcp"}}</code> under <code>mcpServers</code>.</li></ol></div>
  </div>
</div></section>

<section id="ask"><div class="wrap">
  <h2>What to ask</h2>
  <p class="sub">Follow someone on race day, check how a race is going, or see what race day will be like before you enter. Cycling on Windline, running on RunFast.</p>
  ${EXAMPLES.map((e) => `<div class="ex"><div class="txt"><p class="q">${esc(e.q)}</p><p class="a">${esc(e.a)}</p></div><div class="shot"><img src="${IMG}${e.img}.jpg" loading="lazy" width="1520" height="1400" alt="${esc(e.alt)}"></div></div>`).join('\n  ')}
</div></section>

<section id="find"><div class="wrap">
  <h2>Find a club</h2>
  <p class="sub">Starting in January and don’t know a single club? Ask “best running club to join in Fourways”, “beginner cycling group near Sandton” or “trail runs near Cape Town in November”. livedot lists the clubs and organisers on Windline and RunFast near that place, nearest first, with their weekly sessions, whether beginners are welcome, their pace groups and the next session with its weather. Join opens the club’s page, where you sign in or make a free account in the same step. Only approved clubs and organisers, with what they chose to share; never a person, never a private ride. Run a club that isn’t listed? Add it free: <a href="https://windline.tech/pages/?from=livedot-mcp#apply">a cycling club on Windline</a> or <a href="https://runfast.tech/app/?ref=livedot-mcp#/clubs/add">a running club on RunFast</a>. Already on one? <a href="https://windline.tech/support/get-your-club-found-on-livedot/">Get it found on livedot</a> (cycling) or <a href="https://runfast.tech/support/get-your-club-found-on-livedot/">on RunFast</a> (running).</p>
</div></section>

<section id="tools"><div class="wrap">
  <h2>Tools</h2>
  <p class="sub">Read-only, and every tool takes <code>units</code>: metric or imperial, else the asker’s region, else the event’s country with the other in brackets.</p>
  <div class="tools">${TOOLS.map(([n, d]) => `<div><code>${n}</code><p>${esc(d)}</p></div>`).join('')}</div>
</div></section>

<section><div class="wrap how">
  <div><b>One forecast engine</b><p>The weather comes from Windline’s engine, the same as the apps and every livedot page, so the numbers match everywhere: Apple Weather for the next 10 days, 10 years of Copernicus ERA5 records beyond.</p></div>
  <div><b>Live, from the apps</b><p>Positions, goals and finish times come from Windline (cycling) and RunFast (running), the same public live pages anyone can open.</p></div>
  <div><b>Private by design</b><p>Only people who chose to be findable, on public races. No position when someone’s stopped or near the start or finish, and nothing kept about who asked.</p></div>
  <div><b>Your events, your say</b><p>Organisers sign in on Windline or RunFast with the sign-in they already use. New events are drafts, nothing is published until you confirm, finished events never change, and Disconnect in your account stops it at once.</p></div>
</div></section>
</main>
<footer><div class="wrap">
  <p class="sp">Live tracking, proudly brought to you free thanks to ${esc(sponsorName)}.</p>
  <nav aria-label="livedot"><a href="https://livedot.me/">livedot.me</a><a href="https://windline.tech">Windline, for cycling</a><a href="https://runfast.tech">RunFast, for running</a><a href="https://github.com/livedotme/mcp">GitHub</a><a href="https://livedot.me/privacy">Privacy</a><a href="https://livedot.me/terms">Terms</a></nav>
</div></footer>
</body>
</html>`;
}
