/**
 * Offline self-test for the host half: transport, envelope handling, same-origin
 * fence, and the Config projection.
 *
 * Runs the real route handler against a local http server, with the Session log
 * and the Hindsight HTTP calls stubbed, so it proves the endpoint contract and the
 * settings wiring without touching a live memory bank.
 */

import { createServer, request as httpRequest } from "node:http";

import { apply } from "../index.js";
import {
  DEFAULT_BANK,
  DEFAULT_BASE_URL,
  DEFAULT_RETAIN_TIMEOUT_MS,
  DEFAULT_STATUS_TIMEOUT_MS,
  documentIdFor,
  readSettings,
} from "../lib/hindsight.js";

const SESSION_ID = "dsh-selftest-session";
const TEST_BASE_URL = "http://127.0.0.1:9911/";
const TEST_BANK = "hindsight-sync-selftest";

/** Canned Hindsight responses keyed by request path prefix. */
let hindsightCalls = [];
let retained = false;
const REAL_FETCH = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("http://127.0.0.1:9911/")) {
    hindsightCalls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body,
    });
    if (init?.method === "POST") {
      retained = true;
      return new Response(
        JSON.stringify({ success: true, operation_id: "op-selftest" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    const items = retained
      ? [{
          id: documentIdFor(SESSION_ID),
          document_metadata: { synced_through_seq: "2" },
          updated_at: "2026-01-01T00:00:00.000Z",
        }]
      : [];
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return REAL_FETCH(input, init);
};

const events = [
  {
    type: "user/message",
    seq: 1,
    time: Date.now() - 60_000,
    data: { role: "user", content: [{ type: "text", text: "测试用户消息" }] },
  },
  {
    type: "assistant/message",
    seq: 2,
    time: Date.now() - 30_000,
    data: {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "测试助手回复" }],
      },
    },
  },
];

const session = { header: { cwd: "C:\\workspace" }, snapshotEvents: () => events };

let route;
const ctx = {
  sessions: {
    get: (id) => (id === SESSION_ID ? session : undefined),
  },
  webServer: {
    register: (value) => {
      route = value;
      return () => {};
    },
  },
  effect: (fn) => {
    fn();
  },
  inject: () => {
    // The settings service is optional; the transport works without it.
  },
};

apply(ctx, {
  baseUrl: TEST_BASE_URL,
  bank: TEST_BANK,
  retainTimeoutMs: 5_000,
  statusTimeoutMs: 3_000,
});

if (route === undefined) {
  console.error("FAIL: apply() registered no route");
  process.exit(1);
}

const server = createServer((req, res) => {
  route.handler(req, res);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const host = `127.0.0.1:${port}`;

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail === undefined ? "" : `: ${detail}`}`);
  }
}

/**
 * Send one raw HTTP request so headers (Host, Origin) are fully controlled.
 * @param {string} pathname - URL path.
 * @param {{method?: string, headers?: Record<string, string>, body?: string}} options - request options.
 * @returns {Promise<{status: number, text: string, json: any}>} the response.
 */
function send(pathname, options = {}) {
  const method = options.method ?? "POST";
  const body = options.body ?? "";
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          ...(body === "" ? {} : { "content-length": Buffer.byteLength(body) }),
          ...options.headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode, text, json });
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

/**
 * POST one client-request envelope.
 * @param {string} endpoint - endpoint segment.
 * @param {unknown} payload - payload.
 * @param {{headers?: Record<string, string>}} options - extra headers.
 * @returns {Promise<{status: number, text: string, json: any}>} the response.
 */
function rpc(endpoint, payload, options = {}) {
  return send(`/hindsight-sync/${endpoint}`, {
    headers: { "content-type": "application/json", ...options.headers },
    body: JSON.stringify({
      type: "client-request",
      rpcId: `selftest-${endpoint}`,
      method: endpoint,
      payload,
    }),
  });
}

// 1. Status with no synced document yet.
{
  const { status, json } = await rpc("status", { sessionId: SESSION_ID });
  check("status http 200", status === 200, String(status));
  check("status envelope type", json.type === "server-response");
  check("status rpcId echoed", json.rpcId === "selftest-status");
  check("status result ok", json.result?.ok === true, JSON.stringify(json.result));
  check(
    "status currentLastSeq",
    json.result?.value?.currentLastSeq === 2,
    JSON.stringify(json.result?.value),
  );
  check("status no lastSync yet", json.result?.value?.lastSync === null);
}

// 2. Sync honors the configured base URL and bank (trailing slash normalized).
{
  hindsightCalls = [];
  const { status, json } = await rpc("sync", { sessionId: SESSION_ID });
  check("sync http 200", status === 200, String(status));
  check("sync result ok", json.result?.ok === true, JSON.stringify(json.result));
  check(
    "sync documentId",
    json.result?.value?.documentId === `dsh-ui-sync:${SESSION_ID}`,
  );
  check(
    "sync messageCount",
    json.result?.value?.messageCount === 2,
    JSON.stringify(json.result?.value),
  );
  check("sync reached Hindsight once", hindsightCalls.length === 1, JSON.stringify(hindsightCalls));
  if (hindsightCalls[0] !== undefined) {
    const sent = JSON.parse(hindsightCalls[0].body);
    check(
      "sync uses configured base url and bank",
      hindsightCalls[0].url ===
        `${TEST_BASE_URL.replace(/\/$/, "")}/v1/default/banks/${TEST_BANK}/memories`,
      hindsightCalls[0].url,
    );
    check("sync replace mode", sent.items?.[0]?.update_mode === "replace");
    check("sync async", sent.async === true);
    check(
      "sync records the synced seq",
      sent.items?.[0]?.metadata?.synced_through_seq === "2",
    );
  }
}

// 3. Status now reports the retained document.
{
  const { status, json } = await rpc("status", { sessionId: SESSION_ID });
  check("status after sync http 200", status === 200, String(status));
  check(
    "status after sync lastSync seq",
    json.result?.value?.lastSync?.syncedThroughSeq === 2,
    JSON.stringify(json.result?.value),
  );
  check(
    "status after sync timestamp",
    json.result?.value?.lastSync?.at === "2026-01-01T00:00:00.000Z",
  );
}

// 4. Unknown session is a failure envelope, not a transport error.
{
  const { status, json } = await rpc("sync", { sessionId: "other-session" });
  check("unknown session http 200", status === 200);
  check("unknown session failure", json.result?.ok === false, JSON.stringify(json.result));
  check(
    "unknown session code",
    json.result?.error?.code === "hindsight/session-unavailable",
  );
}

// 5. Invalid envelopes are rejected inside the envelope.
{
  const badType = await send("/hindsight-sync/sync", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "server-request", rpcId: "x", method: "sync", payload: {} }),
  });
  check(
    "invalid envelope is a failure",
    badType.json?.result?.error?.code === "gateway/bad-request",
    badType.text,
  );
  const mismatched = await send("/hindsight-sync/sync", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: "x", method: "status", payload: {} }),
  });
  check(
    "method mismatch is a failure",
    mismatched.json?.result?.error?.code === "gateway/bad-request",
    mismatched.text,
  );
}

// 6. Transport guards: method, content type, unknown endpoint, bad JSON.
{
  const wrongMethod = await send("/hindsight-sync/sync", { method: "GET" });
  check("GET is 405", wrongMethod.status === 405, String(wrongMethod.status));
  const wrongType = await send("/hindsight-sync/sync", {
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  check("wrong content type is 415", wrongType.status === 415, String(wrongType.status));
  const unknown = await send("/hindsight-sync/bogus", {
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  check("unknown endpoint is 404", unknown.status === 404, String(unknown.status));
  const badJson = await send("/hindsight-sync/sync", {
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  check("bad JSON is 400", badJson.status === 400, String(badJson.status));
}

// 7. Same-origin fence: cross-origin rejected, desktop and loopback aliases accepted.
{
  const crossOrigin = await rpc(
    "status",
    { sessionId: SESSION_ID },
    { headers: { origin: "http://evil.example" } },
  );
  check("cross-origin is 403", crossOrigin.status === 403, String(crossOrigin.status));

  const desktop = await rpc(
    "status",
    { sessionId: SESSION_ID },
    { headers: { origin: "dsh-app://app" } },
  );
  check("desktop shell origin is accepted", desktop.status === 200, String(desktop.status));

  const loopbackAlias = await rpc(
    "status",
    { sessionId: SESSION_ID },
    { headers: { origin: `http://localhost:${port}` } },
  );
  check("loopback alias is accepted", loopbackAlias.status === 200, String(loopbackAlias.status));

  const rebinding = await rpc(
    "status",
    { sessionId: SESSION_ID },
    { headers: { host: "evil.example" } },
  );
  check("non-loopback Host is rejected", rebinding.status === 403, String(rebinding.status));
}

// 8. Config projection: defaults, plain values, volatile references, invalid input.
{
  const defaults = readSettings(undefined);
  check("settings default base url", defaults.baseUrl === DEFAULT_BASE_URL, defaults.baseUrl);
  check("settings default bank", defaults.bank === DEFAULT_BANK, defaults.bank);
  check(
    "settings default timeouts",
    defaults.retainTimeoutMs === DEFAULT_RETAIN_TIMEOUT_MS &&
      defaults.statusTimeoutMs === DEFAULT_STATUS_TIMEOUT_MS,
  );

  const plain = readSettings({
    baseUrl: " https://memory.example/base/ ",
    bank: "team_bank",
    retainTimeoutMs: 12_000,
    statusTimeoutMs: 900,
  });
  check("settings trims the base url", plain.baseUrl === "https://memory.example/base", plain.baseUrl);
  check("settings keeps a valid bank", plain.bank === "team_bank", plain.bank);
  check(
    "settings reads timeouts",
    plain.retainTimeoutMs === 12_000 && plain.statusTimeoutMs === 900,
  );

  const volatile = readSettings({
    baseUrl: { get: () => "http://volatile.example:8888" },
    bank: { get: () => "live-bank" },
    retainTimeoutMs: { get: () => 9_000 },
    statusTimeoutMs: { get: () => 2_000 },
  });
  check("settings reads volatile config", volatile.baseUrl === "http://volatile.example:8888");
  check("settings reads volatile bank", volatile.bank === "live-bank");

  const invalid = readSettings({
    baseUrl: "ftp://nope",
    bank: "b a d",
    retainTimeoutMs: Number.NaN,
    statusTimeoutMs: 999_999,
  });
  check("settings falls back from an invalid url", invalid.baseUrl === DEFAULT_BASE_URL);
  check("settings falls back from an invalid bank", invalid.bank === DEFAULT_BANK);
  check("settings clamps timeouts", invalid.retainTimeoutMs === DEFAULT_RETAIN_TIMEOUT_MS);
  check("settings clamps status timeout", invalid.statusTimeoutMs === 60_000);
}

server.close();
globalThis.fetch = REAL_FETCH;

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
