/**
 * Host-side bridge between a live DSH Session and a self-hosted Hindsight bank.
 *
 * The browser half only asks for a sync or a status read; the transcript comes from
 * the Session log on the Host (the single source of truth) and the Hindsight request
 * is issued from Node, because the bank has no CORS support and must not be exposed
 * to the page directly.
 *
 * Connection details are not compiled in: the plugin's Config schema (index.js)
 * supplies them, and every request reads the live values so a settings save takes
 * effect without restarting the plugin.
 */

/** Default self-hosted Hindsight base URL (no trailing slash). */
export const DEFAULT_BASE_URL = 'http://localhost:8888';

/** Default memory bank name. */
export const DEFAULT_BANK = 'hermes';

/** Stable document id prefix; one document per Session, replaced on every sync. */
export const DOCUMENT_PREFIX = 'dsh-ui-sync:';

/** A manual sync only enqueues extraction, so the request is small and fast. */
export const DEFAULT_RETAIN_TIMEOUT_MS = 20_000;

/** Reading the document listing is a local, cheap call. */
export const DEFAULT_STATUS_TIMEOUT_MS = 8_000;

/** Bounds accepted for the configurable timeouts. */
const RETAIN_TIMEOUT_RANGE = [1_000, 300_000];
const STATUS_TIMEOUT_RANGE = [500, 60_000];

/**
 * @param {string} sessionId - live Session id.
 * @returns {string} the Hindsight document id that stores this Session's manual sync.
 */
export function documentIdFor(sessionId) {
  return DOCUMENT_PREFIX + sessionId;
}

/**
 * Read one Config field. Volatile fields are live references (`{get()}`); a plain
 * value is accepted too, which keeps the offline self-test and older deployments
 * working without the settings service.
 * @param {object | undefined} config - parsed plugin Config.
 * @param {string} name - field name.
 * @returns {unknown} the current value, or undefined.
 */
function liveValue(config, name) {
  if (config === null || typeof config !== 'object') return undefined;
  const value = config[name];
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Normalize a configured Hindsight base URL.
 * @param {unknown} value - candidate base URL.
 * @returns {string} an http(s) URL without a trailing slash.
 */
export function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return DEFAULT_BASE_URL;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed === '') return DEFAULT_BASE_URL;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return DEFAULT_BASE_URL;
    return trimmed;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

/**
 * Normalize a configured bank name.
 * @param {unknown} value - candidate bank name.
 * @returns {string} a bank name safe to place in a URL path segment.
 */
export function normalizeBank(value) {
  if (typeof value !== 'string') return DEFAULT_BANK;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : DEFAULT_BANK;
}

/**
 * Clamp a configured timeout into its accepted range.
 * @param {unknown} value - candidate timeout in milliseconds.
 * @param {number} fallback - default timeout.
 * @param {[number, number]} range - minimum and maximum accepted values.
 * @returns {number} a usable timeout.
 */
function normalizeTimeout(value, fallback, range) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(range[1], Math.max(range[0], Math.round(number)));
}

/**
 * Project the live Config onto the values this bridge needs.
 * @param {object | undefined} config - parsed plugin Config.
 * @returns {{baseUrl: string, bank: string, retainTimeoutMs: number, statusTimeoutMs: number}} live settings.
 */
export function readSettings(config) {
  return {
    baseUrl: normalizeBaseUrl(liveValue(config, 'baseUrl')),
    bank: normalizeBank(liveValue(config, 'bank')),
    retainTimeoutMs: normalizeTimeout(
      liveValue(config, 'retainTimeoutMs'),
      DEFAULT_RETAIN_TIMEOUT_MS,
      RETAIN_TIMEOUT_RANGE,
    ),
    statusTimeoutMs: normalizeTimeout(
      liveValue(config, 'statusTimeoutMs'),
      DEFAULT_STATUS_TIMEOUT_MS,
      STATUS_TIMEOUT_RANGE,
    ),
  };
}

/**
 * Validate the wire payload without trusting the browser.
 * @param {unknown} payload - RPC payload.
 * @returns {string | undefined} a non-empty session id, or undefined.
 */
export function readSessionId(payload) {
  if (payload === null || typeof payload !== 'object') return undefined;
  const sessionId = payload.sessionId;
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined;
}

/**
 * @param {string} code - stable failure code.
 * @param {string} message - human-readable detail.
 * @param {Record<string, unknown>} [details] - optional structured detail.
 * @returns {{ok: false, error: {code: string, message: string, details: Record<string, unknown>}}} failure result.
 */
export function failure(code, message, details = {}) {
  return { ok: false, error: { code, message, details } };
}

/**
 * @param {unknown} value - JSON-serializable result value.
 * @returns {{ok: true, value: unknown}} success result.
 */
export function success(value) {
  return { ok: true, value };
}

/**
 * Text of one message's content blocks, in block order.
 * Tool calls, reasoning, and other non-conversational blocks are omitted.
 * @param {unknown} content - content block array from a user or assistant message.
 * @returns {string} the visible text, or '' when the message carries none.
 */
export function textOf(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
      parts.push(block.text.trim());
    } else if (block.type === 'image') {
      parts.push('[image]');
    } else if (block.type === 'file') {
      const name = block.attachment && typeof block.attachment.name === 'string' ? block.attachment.name : '';
      parts.push(name === '' ? '[file]' : `[file: ${name}]`);
    }
  }
  return parts.join('\n');
}

/**
 * Build the transcript from the committed Session log.
 * @param {object} session - live Host Session.
 * @returns {{content: string, messageCount: number, firstTime: string | undefined, lastTime: string | undefined, lastMessageSeq: number}} transcript facts.
 */
export function transcriptOf(session) {
  const lines = [];
  let messageCount = 0;
  let firstTime;
  let lastTime;
  let lastMessageSeq = 0;
  for (const event of session.snapshotEvents()) {
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue;
    const content = event.type === 'user/message'
      ? event.data && event.data.content
      : event.data && event.data.message && event.data.message.content;
    const text = textOf(content);
    if (text === '') continue;
    const time = new Date(typeof event.time === 'number' ? event.time : Date.now()).toISOString();
    const role = event.type === 'user/message' ? 'User' : 'Assistant';
    lines.push(`[${time}] ${role}: ${text}`);
    messageCount += 1;
    if (firstTime === undefined) firstTime = time;
    lastTime = time;
    lastMessageSeq = Number(event.seq);
  }
  return { content: lines.join('\n\n'), messageCount, firstTime, lastTime, lastMessageSeq };
}

/**
 * Seq of the newest committed user or assistant message, used for staleness.
 * Cheaper than building the whole transcript.
 * @param {object} session - live Host Session.
 * @returns {number} the newest conversation message seq, or 0 when none exists.
 */
export function latestMessageSeq(session) {
  const events = session.snapshotEvents();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'user/message' && event.type !== 'assistant/message') continue;
    const content = event.type === 'user/message'
      ? event.data && event.data.content
      : event.data && event.data.message && event.data.message.content;
    if (textOf(content) !== '') return Number(event.seq);
  }
  return 0;
}

/**
 * Write this Session's current conversation into Hindsight as one asynchronous retain.
 * Hindsight upserts by document_id, so every click replaces the previous copy instead of
 * accumulating partial ones.
 * @param {{sessions: {get(id: string): object | undefined}}} ctx - Host context.
 * @param {unknown} payload - RPC payload carrying the session id.
 * @param {object} [config] - parsed plugin Config (volatile refs are read live).
 * @returns {Promise<object>} RPC result.
 */
export async function syncSession(ctx, payload, config = {}) {
  const settings = readSettings(config);
  const sessionId = readSessionId(payload);
  if (sessionId === undefined) return failure('hindsight/bad-request', 'A session id is required.');

  const session = ctx.sessions.get(sessionId);
  if (session === undefined) {
    return failure('hindsight/session-unavailable', `Session "${sessionId}" is not live in this process.`);
  }

  const transcript = transcriptOf(session);
  if (transcript.messageCount === 0) {
    return failure('hindsight/empty-conversation', 'This session has no user or assistant messages to sync yet.');
  }

  const syncedAt = new Date().toISOString();
  const documentId = documentIdFor(sessionId);
  const body = {
    items: [{
      content: transcript.content,
      context: `Conversation between the user and the DSH (DeepSeek Harness) coding agent in session ${sessionId}. User turns are the user's words and decisions; assistant turns are the agent's replies. Record decisions, requirements, code changes, commands, errors, and open questions. When an assistant turn claims something is fixed or works, record it as the agent's claim.`,
      document_id: documentId,
      tags: ['harness:dsh', 'source:dsh-ui-sync', `session:${sessionId}`],
      metadata: {
        dsh_session_id: sessionId,
        cwd: session.header && typeof session.header.cwd === 'string' ? session.header.cwd : '',
        synced_at: syncedAt,
        synced_through_seq: String(transcript.lastMessageSeq),
      },
      timestamp: transcript.firstTime,
      update_mode: 'replace',
    }],
    async: true,
  };

  let response;
  try {
    response = await fetch(`${settings.baseUrl}/v1/default/banks/${settings.bank}/memories`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-encoding': 'identity',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(settings.retainTimeoutMs),
    });
  } catch (error) {
    return failure('hindsight/unreachable', `Could not reach Hindsight at ${settings.baseUrl}: ${errorMessage(error)}`);
  }

  const text = await response.text();
  if (!response.ok) {
    return failure('hindsight/rejected', `Hindsight rejected the sync (HTTP ${response.status}): ${truncate(text, 600)}`);
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    result = undefined;
  }
  if (result !== null && result !== undefined && result.success === false) {
    return failure('hindsight/rejected', 'Hindsight reported the sync as failed.');
  }

  return success({
    documentId,
    syncedAt,
    syncedThroughSeq: transcript.lastMessageSeq,
    messageCount: transcript.messageCount,
    operationId: result && typeof result.operation_id === 'string' ? result.operation_id : null,
  });
}

/**
 * Read the Hindsight document that records this Session's last manual sync.
 * @param {{sessions: {get(id: string): object | undefined}}} ctx - Host context.
 * @param {unknown} payload - RPC payload carrying the session id.
 * @param {object} [config] - parsed plugin Config (volatile refs are read live).
 * @returns {Promise<object>} RPC result with `currentLastSeq` and `lastSync`.
 */
export async function statusSession(ctx, payload, config = {}) {
  const settings = readSettings(config);
  const sessionId = readSessionId(payload);
  if (sessionId === undefined) return failure('hindsight/bad-request', 'A session id is required.');

  const session = ctx.sessions.get(sessionId);
  if (session === undefined) {
    return failure('hindsight/session-unavailable', `Session "${sessionId}" is not live in this process.`);
  }

  const currentLastSeq = latestMessageSeq(session);
  const documentId = documentIdFor(sessionId);

  let response;
  try {
    response = await fetch(
      `${settings.baseUrl}/v1/default/banks/${settings.bank}/documents?q=${encodeURIComponent(documentId)}&limit=20`,
      { headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(settings.statusTimeoutMs) },
    );
  } catch (error) {
    return failure('hindsight/unreachable', `Could not reach Hindsight at ${settings.baseUrl}: ${errorMessage(error)}`);
  }

  // The bank has never been written, so there is no document and no sync yet.
  if (response.status === 404) return success({ currentLastSeq, lastSync: null });

  if (!response.ok) {
    return failure('hindsight/rejected', `Hindsight returned HTTP ${response.status} while reading the sync state.`);
  }

  let listing;
  try {
    listing = await response.json();
  } catch {
    return failure('hindsight/invalid-response', 'Hindsight returned a malformed document listing.');
  }

  const items = listing !== null && typeof listing === 'object' && Array.isArray(listing.items) ? listing.items : [];
  const document = items.find((item) => item !== null && typeof item === 'object' && item.id === documentId);
  if (document === undefined) return success({ currentLastSeq, lastSync: null });

  const metadata = document.document_metadata;
  const rawSeq = metadata !== null && typeof metadata === 'object' ? metadata.synced_through_seq : undefined;
  const parsedSeq = Number(rawSeq);
  const syncedThroughSeq = rawSeq !== undefined && rawSeq !== '' && Number.isFinite(parsedSeq) ? parsedSeq : -1;
  const at = typeof document.updated_at === 'string'
    ? document.updated_at
    : (typeof document.created_at === 'string' ? document.created_at : null);

  return success({
    currentLastSeq,
    lastSync: { at, syncedThroughSeq, documentId },
  });
}

/**
 * @param {unknown} error - thrown value.
 * @returns {string} a safe message.
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {string} text - source text.
 * @param {number} max - maximum kept characters.
 * @returns {string} text clipped to `max` characters.
 */
export function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
