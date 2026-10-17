# MCP Registry (registry.modelcontextprotocol.io)

The entry is `../server.json`: name `me.livedot/mcp`, one remote (`streamable-http`, `https://livedot.me/mcp`). The `me.livedot/` namespace proves we own livedot.me through a DNS record.

1. Install the publisher: `brew install mcp-publisher` (or the release binary from github.com/modelcontextprotocol/registry).
2. Make a key pair (any machine): `openssl genpkey -algorithm Ed25519 -out livedot-registry.pem`. Keep the private key out of every repo (Keychain).
3. Get the public key in base64: `openssl pkey -in livedot-registry.pem -pubout -outform DER | tail -c 32 | base64`
4. In Cloudflare DNS for livedot.me, add a TXT record on `livedot.me`: `v=MCPv1; k=ed25519; p=<the base64 public key>`
5. Log in: `mcp-publisher login dns --domain livedot.me --private-key $(openssl pkey -in livedot-registry.pem -noout -text | sed -n '/priv:/,/pub:/p' | grep -v 'priv:\|pub:' | tr -d ' :\n')`
6. From this folder's parent (`mcp/`): `mcp-publisher publish`
7. Check: `curl "https://registry.modelcontextprotocol.io/v0/servers?search=me.livedot"`

A new version: bump `version` in `server.json` (and `package.json`), publish again.
