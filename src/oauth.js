// livedot MCP's sign-in, on livedot.me: the metadata clients read first, and /oauth/* passed through to the authorization server
// (Windline's mcpApi, windline.tech/api/mcp/oauth/*). livedot.me keeps nothing: no client, code or token is stored here.
//   GET /.well-known/oauth-protected-resource[/mcp]   RFC 9728: this server is https://livedot.me/mcp, signed in by https://livedot.me
//   GET /.well-known/oauth-authorization-server        RFC 8414: the endpoints, PKCE S256, dynamic registration, the scopes
//   /oauth/register | authorize | token | revoke       passed through unchanged, with the visitor's address for the limits
export const SCOPES = ['events.read', 'events.write', 'events.publish', 'clubs.post'];
const origin = (request, env) => (env.MCP_ISSUER || new URL(request.url).origin).replace(/\/$/, '');
const meta = (body) => new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } });

export function protectedResource(request, env = {}) {
  const o = origin(request, env);
  return meta({ resource: `${o}/mcp`, authorization_servers: [o], scopes_supported: SCOPES, bearer_methods_supported: ['header'],
    resource_name: 'livedot MCP', resource_documentation: 'https://github.com/livedotme/mcp', resource_policy_uri: 'https://livedot.me/privacy', resource_tos_uri: 'https://livedot.me/terms' });
}
export function authorizationServer(request, env = {}) {
  const o = origin(request, env);
  return meta({ issuer: o, authorization_endpoint: `${o}/oauth/authorize`, token_endpoint: `${o}/oauth/token`, registration_endpoint: `${o}/oauth/register`, revocation_endpoint: `${o}/oauth/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'], revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: SCOPES, service_documentation: 'https://github.com/livedotme/mcp', op_policy_uri: 'https://livedot.me/privacy', op_tos_uri: 'https://livedot.me/terms' });
}
/** /oauth/<name> → the authorization server, as it is (method, body, the client's own Authorization), with the visitor's address. */
export async function proxyOAuth(request, env = {}) {
  const name = new URL(request.url).pathname.replace(/^\/oauth\//, '');
  if (!/^(register|authorize|token|revoke)$/.test(name)) return new Response('Not found', { status: 404 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version', 'Access-Control-Max-Age': '86400' } });
  const base = env.MCP_AUTH_API || 'https://windline.tech/api/mcp', url = new URL(request.url);
  const h = new Headers({ Accept: request.headers.get('Accept') || '*/*' });
  for (const k of ['Content-Type', 'Authorization']) if (request.headers.get(k)) h.set(k, request.headers.get(k));
  const ip = request.headers.get('CF-Connecting-IP'); if (ip && env.MCP_PROXY_SECRET) { h.set('X-Livedot-Client-Ip', ip); h.set('X-Livedot-Proxy', env.MCP_PROXY_SECRET); }
  const r = await fetch(`${base}/oauth/${name}${url.search}`, { method: request.method, headers: h, body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(), redirect: 'manual' });
  const out = new Headers();
  for (const k of ['Content-Type', 'Location', 'Cache-Control', 'WWW-Authenticate', 'X-Frame-Options', 'Content-Security-Policy']) if (r.headers.get(k)) out.set(k, r.headers.get(k));
  out.set('Access-Control-Allow-Origin', '*'); out.set('X-Robots-Tag', 'noindex'); if (!out.get('Cache-Control')) out.set('Cache-Control', 'no-store');
  return new Response(r.body, { status: r.status, headers: out });
}
