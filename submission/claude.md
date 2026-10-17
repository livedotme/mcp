# Claude connectors directory

**Where:** Anthropic's MCP directory submission form (linked from the Claude help centre's "remote MCP servers" / connectors directory pages).

**Fields** (from [common.md](common.md)):
- Server name: **livedot** · URL: `https://livedot.me/mcp` · Transport: Streamable HTTP · Authentication: none
- Description, tagline, category: common.md
- Logo: `logos/livedot.svg` (and `logos/livedot-512.png` if a PNG is asked)
- Documentation: https://github.com/livedotme/mcp · Website: https://livedot.me/mcp
- Privacy policy: https://livedot.me/privacy · Terms: https://livedot.me/terms · Support: hello@windline.tech
- Example prompts (3): "Where's the demo runner in the Comrades demo?", "Fly the Comrades", "What will the weather be like for the NYC Marathon?"
- Test account: not needed (no sign-in)

**What the review checks, and where it's answered:**
- Every tool has a title and `readOnlyHint` / `destructiveHint` annotations (`src/server.js`).
- Tool descriptions say what each tool does and when to use it; they ask the model to ask one short question rather than guess between people.
- The UI is an MCP Apps resource (`ui://livedot/live-map.html`, `text/html;profile=mcp-app`) with a declared CSP.

**Risk to settle first:** the descriptions ask the model to end with the sponsor line "word for word" (see [README.md](README.md)).
