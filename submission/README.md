# Submitting livedot MCP

One pack per directory, ready to paste. Wes clicks submit; nobody else creates accounts or submits.

| Directory | Pack | Needs first |
|---|---|---|
| ChatGPT app directory | [chatgpt.md](chatgpt.md) | OpenAI Platform account with a verified developer identity |
| Claude connectors directory | [claude.md](claude.md) | Anthropic's directory submission form |
| MCP Registry (official) | [mcp-registry.md](mcp-registry.md) | A DNS TXT record on livedot.me (Cloudflare) |
| Smithery | [smithery.md](smithery.md) | GitHub sign-in on smithery.ai |
| Glama | [glama.md](glama.md) | The public repo github.com/livedotme/mcp live; your GitHub username in `glama.json` |
| mcp.so | [mcp-so.md](mcp-so.md) | GitHub sign-in on mcp.so |
| PulseMCP | [pulsemcp.md](pulsemcp.md) | Nothing (it also picks up the MCP Registry entry) |

**Shared copy, files and URLs:** [common.md](common.md) · logos in [logos/](logos) (SVG, 1024, 512, 256, 128, 64 px) · 3x screenshots in [../docs/shots](../docs/shots) (use the `-widget.png` ones).

**Order:** 1. make the repo public, 2. MCP Registry (it feeds PulseMCP and others), 3. Smithery and Glama, 4. ChatGPT and Claude (reviews take longest), 5. mcp.so and PulseMCP.

**Before ChatGPT and Claude, a decision for Wes (brand and money):** both reviews look at whether an app advertises, and Anthropic's directory rules look at tool descriptions that steer the model. Today every answer ends with "Live tracking, proudly brought to you free thanks to ProLend." and each tool description asks the model to keep it word for word. If a reviewer pushes back, the fallback is to keep the line in the answer text and the widget footer and drop the "word for word" instruction from the descriptions (one line in `src/server.js`).
