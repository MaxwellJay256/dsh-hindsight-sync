/**
 * Host half of the Hindsight sync bundle.
 *
 * The browser tab POSTs a small JSON envelope to a same-origin endpoint served by
 * this half: the transcript is assembled from the Host Session log, and the
 * Hindsight request runs in Node so the page never needs cross-origin access.
 *
 * The transport mirrors the connection service's unary client-request /
 * server-response envelope (`{type, rpcId, method, payload}` →
 * `{type, rpcId, result}`) but the route is registered directly on the web
 * carrier. Registering a shared connection channel from a profile plugin is not
 * usable: that registration resolves `webServer` against the connection
 * service's own providing context, which never injects it.
 *
 * This module also declares the plugin Config. Every user-specific value (bank,
 * server URL, timeouts) lives there instead of in the source, so the same
 * package works on any machine and the DSH settings page can edit it. Fields
 * are volatile: a save commits into the running references without remounting
 * the plugin, so the HTTP route and the browser tab survive.
 */

import Schema from '@deepseek-ai/schemastery';

import {
  DEFAULT_BANK,
  DEFAULT_BASE_URL,
  DEFAULT_RETAIN_TIMEOUT_MS,
  DEFAULT_STATUS_TIMEOUT_MS,
  failure,
  statusSession,
  syncSession,
} from './lib/hindsight.js';

/** One package-prefixed endpoint shared by the single conversation tab. */
export const ROUTE = '/hindsight-sync';

/** Endpoint segments this half answers. */
const ENDPOINTS = new Set(['sync', 'status']);

/** Upper bound on one request body; a transcript request is a few MB at most. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Endpoint segment shape accepted from the browser. */
const SEGMENT = /^[A-Za-z0-9_$.-]+$/;

/** The Session store and the web carrier are both required by this half. */
export const inject = ['sessions', 'webServer'];

/**
 * Live settings. Every field is volatile, so a settings save commits into the
 * running references instead of restarting the plugin. Defaults live in the
 * schema (not in the bundle patch), so "reset to default" removes the override.
 */
export const Config = Schema.object({
  baseUrl: Schema.string()
    .pattern(/^https?:\/\/\S+$/)
    .default(DEFAULT_BASE_URL)
    .description('Base URL of the self-hosted Hindsight service, for example http://localhost:8888.')
    .volatile(),
  bank: Schema.string()
    .pattern(/^[A-Za-z0-9._-]+$/)
    .default(DEFAULT_BANK)
    .description('Hindsight memory bank that receives this machine’s synced conversations.')
    .volatile(),
  retainTimeoutMs: Schema.number()
    .step(1)
    .min(1_000)
    .max(300_000)
    .default(DEFAULT_RETAIN_TIMEOUT_MS)
    .description('How long a manual sync may wait for Hindsight to accept the retain call.')
    .volatile(),
  statusTimeoutMs: Schema.number()
    .step(1)
    .min(500)
    .max(60_000)
    .default(DEFAULT_STATUS_TIMEOUT_MS)
    .description('How long a sync-status read may take.')
    .volatile(),
});

/**
 * @param {object} ctx - Host plugin context.
 * @param {object} config - parsed Config (volatile fields are live references).
 */
export function apply(ctx, config) {
  // This bundle ships its own settings page, so the settings service should not
  // auto-generate one. A deployment without the settings service still runs the
  // plugin: the optional child fiber simply never starts.
  ctx.inject(['settings'], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      'hindsight-sync: settings presentation',
    );
  });

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: (req, res) => handle(ctx, config, req, res),
      }),
    'hindsight-sync: http route',
  );
}

/**
 * Answer one HTTP exchange under the route prefix.
 * @param {object} ctx - Host plugin context.
 * @param {object} config - parsed Config (read live for every request).
 * @param {import('node:http').IncomingMessage} req - request.
 * @param {import('node:http').ServerResponse} res - response.
 * @returns {Promise<void>}
 */
async function handle(ctx, config, req, res) {
  try {
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
    const endpoint = endpointOf(pathname);
    if (endpoint === undefined || !ENDPOINTS.has(endpoint)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!sameOrigin(req)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' });
      res.end();
      return;
    }
    const contentType = header(req, 'content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== 'application/json') {
      res.writeHead(415);
      res.end();
      return;
    }
    const body = await readJson(req);
    if (body === undefined) {
      res.writeHead(400);
      res.end();
      return;
    }
    const rpcId =
      typeof body.rpcId === 'string' && body.rpcId !== ''
        ? body.rpcId
        : 'unknown';
    if (body.type !== 'client-request' || typeof body.method !== 'string') {
      respond(
        res,
        rpcId,
        failure('gateway/bad-request', 'invalid client-request message'),
      );
      return;
    }
    if (body.method !== endpoint) {
      respond(
        res,
        rpcId,
        failure(
          'gateway/bad-request',
          `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
        ),
      );
      return;
    }
    const result =
      endpoint === 'sync'
        ? await syncSession(ctx, body.payload, config)
        : await statusSession(ctx, body.payload, config);
    respond(res, rpcId, result);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(
        `hindsight-sync: ${error instanceof Error ? error.message : String(error)}`,
      );
    } else {
      res.destroy();
    }
  }
}

/**
 * Endpoint segment under the route prefix, or undefined for anything else.
 * @param {string} pathname - URL path.
 * @returns {string | undefined} the endpoint.
 */
function endpointOf(pathname) {
  if (!pathname.startsWith(`${ROUTE}/`)) return undefined;
  const endpoint = pathname.slice(ROUTE.length + 1);
  return SEGMENT.test(endpoint) ? endpoint : undefined;
}

/** Loopback host names that name the same server. */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Normalize a `host[:port]` authority into `loopback:<port>`, or null when the
 * authority is not a loopback name.
 * @param {string} authority - Host or Origin authority.
 * @returns {string | null} the normalized authority.
 */
function loopbackAuthority(authority) {
  try {
    const parsed = new URL(`http://${authority}`);
    if (!LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) return null;
    return `loopback:${parsed.port === '' ? '80' : parsed.port}`;
  } catch {
    return null;
  }
}

/**
 * Reject cross-origin writes. The web carrier only listens on loopback, so a
 * Host that is not a loopback name (LAN address, rebound DNS name) is refused;
 * `localhost`, `127.0.0.1` and `[::1]` on the same port count as one origin.
 * The desktop shell forwards requests from its `dsh-app:` page, which is a
 * protocol only the shell itself can produce, so it is accepted as well.
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {boolean} whether the request is same-origin (or originless).
 */
function sameOrigin(req) {
  const host = header(req, 'host');
  const hostKey = host === undefined ? null : loopbackAuthority(host);
  if (hostKey === null) return false;
  const origin = header(req, 'origin');
  if (origin === undefined || origin === '') return true;
  try {
    const url = new URL(origin);
    if (url.protocol === 'dsh-app:') return true;
    return loopbackAuthority(url.host) === hostKey;
  } catch {
    return false;
  }
}

/**
 * @param {import('node:http').IncomingMessage} req - request.
 * @param {string} name - header name.
 * @returns {string | undefined} the header value.
 */
function header(req, name) {
  const value = req.headers[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/**
 * Read and parse the request body.
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {Promise<unknown | undefined>} parsed body, or undefined when unusable.
 */
async function readJson(req) {
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) return undefined;
      chunks.push(buffer);
    }
  } catch {
    return undefined;
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Write the server half of the envelope the browser parses.
 * @param {import('node:http').ServerResponse} res - response.
 * @param {string} rpcId - correlation id echoed back.
 * @param {{ok: true, value: unknown} | {ok: false, error: object}} result - result envelope.
 */
function respond(res, rpcId, result) {
  if (res.headersSent) return;
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify({ type: 'server-response', rpcId, result }));
}
