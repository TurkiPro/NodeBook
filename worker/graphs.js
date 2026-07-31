// Graph + folder data API. Every statement is scoped by user_id — that is what
// replaces Postgres row-level security, which D1 does not have.

import { broadcast } from './realtime.js';

const EMPTY_GRAPH = '{"nodes":{},"edges":[],"view":{"tx":0,"ty":0,"scale":1}}';
const now = () => new Date().toISOString();

/** Rows go out shaped exactly like the old Supabase select, so the picker is unchanged. */
function rowToGraph(row) {
  return {
    id:         row.id,
    title:      row.title,
    folder_id:  row.folder_id,
    version:    row.version,
    updated_at: row.updated_at,
    data:       JSON.parse(row.data),
  };
}

export async function listGraphs(env, user) {
  const { results } = await env.DB.prepare(
    `SELECT id, title, folder_id, version, updated_at, data
       FROM graphs WHERE user_id = ? ORDER BY updated_at DESC`
  ).bind(user.id).all();
  return Response.json((results || []).map(rowToGraph));
}

export async function createGraph(env, user, body) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO graphs (id, user_id, folder_id, title, data, version, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`
  ).bind(id, user.id, body.folderId || null, body.title || 'Untitled', EMPTY_GRAPH, now()).run();
  return Response.json({ id });
}

export async function getGraph(env, user, id) {
  const row = await env.DB.prepare(
    'SELECT id, title, folder_id, version, updated_at, data FROM graphs WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first();
  if (!row) return new Response('not found', { status: 404 });
  return Response.json(rowToGraph(row));
}

/**
 * Push a new revision. The server owns `version` — it always increments — so two
 * devices can never mint the same number the way the old client-side +1 could.
 */
export async function putGraph(env, user, id, body, cid) {
  const data = JSON.stringify(body.data ?? {});
  const res = await env.DB.prepare(
    `UPDATE graphs SET data = ?, title = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND user_id = ?
      RETURNING version`
  ).bind(data, body.title || 'Untitled', now(), id, user.id).first();

  if (!res) return new Response('not found', { status: 404 });

  await broadcast(env, id, { data: body.data ?? {}, version: res.version }, cid);
  return Response.json({ version: res.version });
}

export async function renameGraph(env, user, id, body) {
  await env.DB.prepare('UPDATE graphs SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(body.title || 'Untitled', now(), id, user.id).run();
  return Response.json({ ok: true });
}

export async function deleteGraphs(env, user, body) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return Response.json({ ok: true });
  const holes = ids.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM graphs WHERE user_id = ? AND id IN (${holes})`)
    .bind(user.id, ...ids).run();
  return Response.json({ ok: true });
}

export async function moveGraphs(env, user, body) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return Response.json({ ok: true });
  const holes = ids.map(() => '?').join(',');
  await env.DB.prepare(
    `UPDATE graphs SET folder_id = ? WHERE user_id = ? AND id IN (${holes})`
  ).bind(body.folderId || null, user.id, ...ids).run();
  return Response.json({ ok: true });
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function listFolders(env, user) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, created_at FROM folders WHERE user_id = ? ORDER BY created_at ASC'
  ).bind(user.id).all();
  return Response.json(results || []);
}

export async function createFolder(env, user, body) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)'
  ).bind(id, user.id, body.name || 'New Folder', now()).run();
  return Response.json({ id });
}

export async function renameFolder(env, user, id, body) {
  await env.DB.prepare('UPDATE folders SET name = ? WHERE id = ? AND user_id = ?')
    .bind(body.name || 'New Folder', id, user.id).run();
  return Response.json({ ok: true });
}

export async function deleteFolder(env, user, id) {
  // Graphs inside become ungrouped rather than deleted — matches the old
  // ON DELETE SET NULL and what the confirm dialog promises the user.
  await env.DB.prepare('UPDATE graphs SET folder_id = NULL WHERE folder_id = ? AND user_id = ?')
    .bind(id, user.id).run();
  await env.DB.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?')
    .bind(id, user.id).run();
  return Response.json({ ok: true });
}
