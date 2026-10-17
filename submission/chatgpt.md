# ChatGPT app directory

**Where:** OpenAI Platform (platform.openai.com), Apps, submit an app for review. Signed in as the account that owns the app; the developer identity must be verified first.

**Fields** (from [common.md](common.md)):
- App name: **livedot** · Subtitle: *Live race tracking, in ChatGPT and Claude.*
- Short and long description, category, keywords: common.md
- MCP server URL: `https://livedot.me/mcp` · Authentication: **None**
- Logo: `logos/livedot-1024.png` (square; the form scales it) and `logos/livedot-512.png` if asked
- Screenshots (3x, widget only): `../docs/shots/picker-to-map-widget.png`, `picker-widget.png`, `fly-comrades-widget.png`, `weather-forecast-widget.png`, `tour-route-widget.png`
- Privacy policy: https://livedot.me/privacy · Terms: https://livedot.me/terms · Support: hello@windline.tech · Website: https://livedot.me/mcp
- Test prompts and expected answers: common.md, 1 to 5

**What the review checks, and where it's answered:**
- Tool annotations: every tool `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` (`src/server.js`).
- The widget's CSP: `openai/widgetCSP` and `_meta.ui.csp` on the resource: unpkg.com (MapLibre), tiles.openfreemap.org (the basemap), s3.amazonaws.com (terrain for the flyover), fonts.googleapis.com and fonts.gstatic.com. No other origin.
- Links out: Follow live, Fly it in 3D and the event pages open through `openai.openExternal` (livedot.me, windline.tech, runfast.tech, tour./event.windline.tech, app.windline.tech).
- Personal data: public, findable people only; no position when stopped or near the start or finish; nothing stored about the asker.

**The sponsor line:** it's in each tool result's text and the widget's footer, as attribution; no tool description tells the model to repeat it.
