// Nodebook API. Serves the Vite build from [assets] and everything under /api.

import {
  parseAuthKey, hashAuthKey, verifyAuthKey,
  createSession, destroySession, currentUser, EMAIL_RE,
} from './auth.js';
import * as G from './graphs.js';

export { GraphRoom } from './realtime.js';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

// `tag` is what src/auth/ui.js switches on to pick its inline error copy.
const fail = (status, tag, message) => json({ error: tag, message }, status);

/**
 * @returns the parsed body, {} for an empty body, or null when the body is
 * present but unparseable. Returning {} for malformed JSON (the old behaviour)
 * let a truncated request reach handlers dressed as a valid empty object.
 */
async function readJson(request) {
  let text;
  try { text = await request.text(); } catch { return null; }
  if (!text) return {};
  try { return JSON.parse(text); } catch { return null; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return await route(request, env, url);
    } catch (e) {
      console.error('api error', e.stack || e.message);
      return fail(500, 'server_error', 'Something went wrong.');
    }
  },
};

async function route(request, env, url) {
  const path   = url.pathname.replace(/^\/api/, '');
  const method = request.method;

  // Read the body once, up front — request.text() cannot be called twice, and a
  // body that is present but unparseable is rejected here rather than being
  // handed to a route as an innocent-looking {}.
  let body = {};
  if (method !== 'GET' && method !== 'DELETE') {
    body = await readJson(request);
    if (body === null) return fail(400, 'invalid_json', 'Request body was not valid JSON.');
  }

  // ── Auth (unauthenticated) ───────────────────────────────────────────────
  if (path === '/auth/signup' && method === 'POST') {
    const { email, authKey } = body;
    const addr = String(email || '').trim().toLowerCase();
    const key  = parseAuthKey(authKey);

    if (!EMAIL_RE.test(addr)) return fail(400, 'invalid_email', 'Enter a valid email address.');
    // Password length is enforced in src/auth/crypto.js — by design this Worker
    // receives only the derived key and cannot see the password behind it.
    if (!key) return fail(400, 'bad_auth_key', 'Malformed credentials.');

    const existing = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?')
      .bind(addr).first();
    if (existing) return fail(409, 'email_exists', 'This email is already registered.');

    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
    ).bind(id, addr, await hashAuthKey(key), new Date().toISOString()).run();

    // No email confirmation step — the account is live immediately.
    const cookie = await createSession(env, request, id);
    return json({ user: { id, email: addr } }, 200, { 'Set-Cookie': cookie });
  }

  if (path === '/auth/signin' && method === 'POST') {
    const { email, authKey } = body;
    const addr = String(email || '').trim().toLowerCase();
    const key  = parseAuthKey(authKey);
    if (!key) return fail(400, 'bad_auth_key', 'Malformed credentials.');

    const user = await env.DB.prepare(
      'SELECT id, email, password_hash FROM users WHERE lower(email) = ?'
    ).bind(addr).first();
    // Same response whether the address is unknown or the key is wrong —
    // otherwise this endpoint enumerates registered emails.
    if (!user) return fail(401, 'invalid_credentials', 'Incorrect email or password.');

    const { ok, needsRehash } = await verifyAuthKey(key, user.password_hash);
    if (!ok) return fail(401, 'invalid_credentials', 'Incorrect email or password.');

    // Stored at a different iteration count — restretch while we hold the key.
    if (needsRehash) {
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .bind(await hashAuthKey(key), user.id).run();
    }

    const cookie = await createSession(env, request, user.id);
    return json({ user: { id: user.id, email: user.email } }, 200, { 'Set-Cookie': cookie });
  }

  if (path === '/auth/signout' && method === 'POST') {
    const cookie = await destroySession(env, request);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  }

  // ── Everything below requires a session ──────────────────────────────────
  const user = await currentUser(env, request);

  if (path === '/auth/me') {
    return user ? json({ user }) : fail(401, 'no_session', 'Not signed in.');
  }
  if (!user) return fail(401, 'no_session', 'Not signed in.');

  const cid = url.searchParams.get('cid') || request.headers.get('X-Client-Id') || null;

  // ── Graphs ───────────────────────────────────────────────────────────────
  if (path === '/graphs' && method === 'GET')  return G.listGraphs(env, user);
  if (path === '/graphs' && method === 'POST') return G.createGraph(env, user, body);
  if (path === '/graphs/delete' && method === 'POST') return G.deleteGraphs(env, user, body);
  if (path === '/graphs/move'   && method === 'POST') return G.moveGraphs(env, user, body);

  const socket = path.match(/^\/graphs\/([^/]+)\/socket$/);
  if (socket) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    // Confirm ownership before handing the connection to the room, otherwise
    // anyone with a graph id could listen in on someone else's edits.
    const owned = await env.DB.prepare('SELECT 1 FROM graphs WHERE id = ? AND user_id = ?')
      .bind(socket[1], user.id).first();
    if (!owned) return new Response('not found', { status: 404 });

    const stub = env.GRAPH_ROOM.get(env.GRAPH_ROOM.idFromName(socket[1]));
    return stub.fetch(new Request(`https://do/socket?cid=${encodeURIComponent(cid || '')}`, request));
  }

  const one = path.match(/^\/graphs\/([^/]+)$/);
  if (one) {
    const id = one[1];
    if (method === 'GET')   return G.getGraph(env, user, id);
    if (method === 'PUT')   return G.putGraph(env, user, id, body, cid);
    if (method === 'PATCH') return G.renameGraph(env, user, id, body);
  }

  // ── Folders ──────────────────────────────────────────────────────────────
  if (path === '/folders' && method === 'GET')  return G.listFolders(env, user);
  if (path === '/folders' && method === 'POST') return G.createFolder(env, user, body);

  const folder = path.match(/^\/folders\/([^/]+)$/);
  if (folder) {
    if (method === 'PATCH')  return G.renameFolder(env, user, folder[1], body);
    if (method === 'DELETE') return G.deleteFolder(env, user, folder[1]);
  }

  return fail(404, 'not_found', 'No such endpoint.');
}
