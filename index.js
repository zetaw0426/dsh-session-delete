/**
 * Host half of session-delete: one guarded deletion operation exposed through
 * a trust-fenced webServer route (consumed by the browser menu action) and an
 * agent tool with matching parameters.
 *
 * DSH ships no session-deletion API: the persistence seam is append-only and
 * the workspace registry only archives. This plugin therefore removes the
 * session-owned log directory and its projection-cache record itself, after
 * detaching the session from the workspace registry through the registry's
 * own public write path (so the live sidebar updates and the durable account
 * stays consistent). Live sessions — anything still held by the in-memory
 * session store or the agent registry — are refused; the user must switch
 * away (and stop running work) first.
 */
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdir, rm, stat } from 'node:fs/promises';

export const name = 'session-delete';
export const inject = ['webServer', 'connection'];

const ROUTE_PATH = '/session-delete/delete';
const MAX_BODY_BYTES = 64 * 1024;
const SESSION_ID_PATTERN = /^session-[0-9a-zA-Z_-]+$/;

/** Deployment roots, overridable through the row config. */
function rootsOf(config) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  const pick = (value, fallback) =>
    typeof value === 'string' && value.length > 0 ? value : fallback;
  return {
    sessionRoot: pick(config?.sessionRoot, join(home, 'sessions')),
    storageRoot: pick(config?.storageRoot, join(home, 'storages')),
  };
}

/** Locate the session-owned directory under any project directory of the root. */
async function findSessionDir(root, sessionId) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, sessionId);
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      // keep scanning
    }
  }
  return null;
}

/**
 * The one deletion operation. Returns an explicit status; a failure carries
 * a stable code the UI localizes.
 */
async function deleteSession(ctx, roots, sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    return { ok: false, code: 'bad-id', message: 'sessionId must be a session-<id> string' };
  }

  // Live guard: an open or running session may hold a write handle and would
  // re-materialize its log; refuse instead of deleting underneath it.
  const sessions = ctx.get('sessions');
  const agents = ctx.get('agents');
  if (sessions?.get(sessionId) !== undefined || agents?.get(sessionId) !== undefined) {
    return {
      ok: false,
      code: 'session-live',
      message: 'session is open or running; switch to another session and stop its work first',
    };
  }

  const dir = await findSessionDir(roots.sessionRoot, sessionId);
  let persisted = false;
  const persistence = ctx.get('sessionPersistence');
  if (persistence !== undefined) {
    try {
      persisted = (await persistence.stat(sessionId)) !== undefined;
    } catch {
      persisted = false;
    }
  }
  if (dir === null && !persisted) {
    return { ok: false, code: 'not-found', message: `no durable log for ${sessionId}` };
  }

  // Registry cleanup through the registry's own write path, before the files
  // go away: unpin/unarchive drop the global marks, detachSession removes the
  // workspace account slot and emits the change the live sidebar follows.
  const registry = ctx.get('workspaceRegistry');
  if (registry !== undefined) {
    try {
      if (registry.pinnedSessionIds.includes(sessionId)) {
        await registry.unpinSession(sessionId);
      }
      if (registry.archivedSessionIds.includes(sessionId)) {
        await registry.unarchiveSession(sessionId);
      }
      for (const workspace of registry.list()) {
        if (workspace.sessionIds.includes(sessionId)) {
          if (typeof workspace.detachSession === 'function') {
            await workspace.detachSession(sessionId);
          }
          break;
        }
      }
    } catch (error) {
      return { ok: false, code: 'registry-failed', message: String(error) };
    }
  }

  try {
    if (dir !== null) await rm(dir, { recursive: true, force: true });
    await rm(join(roots.storageRoot, 'session_projcache', 'sessions', `${sessionId}.json`), { force: true });
  } catch (error) {
    return { ok: false, code: 'io-failed', message: String(error) };
  }

  // Tell the connected clients to drop the session from their catalog. This
  // is the same signal the Session Controller emits on session/disposed; a
  // cold external deletion produces no lifecycle event of its own, so without
  // it the browser keeps the stale summary (rendered as an ungrouped row).
  try {
    ctx.emit('api-session/removed', sessionId);
  } catch {
    // The files are gone; a missing event bus must not fail the deletion.
  }
  return { ok: true };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readBoundedBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

const STATUS_BY_CODE = {
  'bad-id': 400,
  'session-live': 409,
  'not-found': 404,
  'registry-failed': 500,
  'io-failed': 500,
};

export function apply(ctx, config) {
  const roots = rootsOf(config);

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req);
      if (rejection !== undefined) {
        res.statusCode = rejection;
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('allow', 'POST');
        res.end();
        return;
      }
      if (String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        sendJson(res, 415, { ok: false, code: 'bad-request', message: 'content-type must be application/json' });
        return;
      }
      let text;
      try {
        text = await readBoundedBody(req);
      } catch {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body unreadable' });
        return;
      }
      if (text === null) {
        sendJson(res, 413, { ok: false, code: 'bad-request', message: 'request body is too large' });
        return;
      }
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (typeof body !== 'object' || body === null || typeof body.sessionId !== 'string') {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: 'body must be JSON with a string sessionId' });
        return;
      }
      const result = await deleteSession(ctx, roots, body.sessionId);
      sendJson(res, result.ok ? 200 : (STATUS_BY_CODE[result.code] ?? 500), result);
    },
  }), `session-delete: POST ${ROUTE_PATH}`);

  // Same operation for the agent plane; the session approval policy gates it.
  const tools = ctx.get('tools');
  if (tools !== undefined) {
    try {
      ctx.effect(() => tools.register({
        name: 'session_delete',
        description:
          'Permanently delete one cold session by its full session id: removes its durable log and projection cache and detaches it from its workspace. Irreversible. Refuses a session that is currently open or running (code session-live); switch away and stop its work first. Does not delete workspace files or attachments.',
        parameters: {
          sessionId: {
            type: 'string',
            description: 'Full id of the session to delete, for example session-3a2f2ddc-75d7-40a9-bfe8-617ed0feaecd.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean', description: 'Whether the session was deleted.' },
              code: { type: 'string', description: 'Stable failure code when ok is false.' },
              message: { type: 'string', description: 'Failure detail when ok is false.' },
            },
            required: ['ok'],
          },
          render: (_args, value) => [{
            type: 'text',
            text: value.ok ? 'session deleted' : `session delete failed: ${value.code ?? 'unknown'} ${value.message ?? ''}`.trim(),
          }],
        },
        async execute(args) {
          return await deleteSession(ctx, roots, args.sessionId);
        },
      }), 'session-delete: tool session_delete');
    } catch (error) {
      ctx.logger?.warn?.(`session-delete: tool registration failed: ${String(error)}`);
    }
  }
}