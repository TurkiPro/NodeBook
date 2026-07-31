import {
  listGraphs, listFolders, createGraph, deleteGraphs,
  renameGraph, createFolder, renameFolder, deleteFolder, moveGraphsToFolder,
} from '../sync/cloud.js';
import { pickerRoot } from '../dom.js';
import { showConfirm } from '../utils/dialog.js';
import { buildPickerUI } from './ui.js';
import { signOut } from '../auth/session.js';
import { showToast } from '../utils/toast.js';

/**
 * Every picker action writes to the server, and each one used to fail into
 * console.error — a rename or delete would appear to work, then quietly revert
 * on the next refresh. Report it instead.
 */
function reportFailure(action, err) {
  console.error(`[picker] ${action} failed:`, err);
  showToast(err?.status === 0 ? `Can't ${action} — ${err.message}` : `Could not ${action}`);
}

let currentUser     = null;
let onSelectGraph   = null;
let collapsedFolders = new Set();

export async function showPicker(user, onSelect) {
  currentUser   = user;
  onSelectGraph = onSelect;
  pickerRoot.style.display = 'block';
  pickerRoot.innerHTML = '<div class="picker-loading">Loading your graphs…</div>';
  await refreshPicker();
}

export function hidePicker() {
  pickerRoot.innerHTML = '';
  pickerRoot.style.display = 'none';
}

async function refreshPicker() {
  let graphs  = [];
  let folders = [];
  try {
    [graphs, folders] = await Promise.all([
      listGraphs(currentUser.id),
      listFolders(currentUser.id),
    ]);
  } catch (err) {
    console.error('[picker] load failed:', err);
    pickerRoot.innerHTML = `
      <div class="picker-loading picker-loading--err">
        Could not load graphs: ${err?.message || String(err)}<br><br>
        <button onclick="location.reload()" style="margin-top:8px;padding:6px 14px;background:transparent;border:1px solid #555;color:#aaa;font-family:inherit;font-size:11px;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;border-radius:3px;">Retry</button>
      </div>`;
    return;
  }

  buildPickerUI(pickerRoot, {
    user:    currentUser,
    graphs,
    folders,
    collapsedFolders,
    callbacks: {
      onOpen:           (id)          => onSelectGraph?.(id),
      onCreate:         (folderId)    => handleCreate(folderId),
      onCreateInFolder: (folderId)    => handleCreate(folderId),
      onDelete:         (ids)         => handleDelete(ids),
      onRename:         (id, title)   => renameGraph(id, title).catch(e => reportFailure('rename that graph', e)),
      onCreateFolder:   (name)        => handleCreateFolder(name),
      onRenameFolder:   (id, name)    => renameFolder(id, name).catch(e => reportFailure('rename that folder', e)),
      onDeleteFolder:   (id)          => handleDeleteFolder(id),
      onMoveToFolder:   (ids, folder) => handleMoveToFolder(ids, folder),
      onSignOut:        ()            => signOut(),
    },
  });
}

async function handleCreate(folderId = null) {
  try {
    const id = await createGraph(currentUser.id, 'Untitled', folderId);
    onSelectGraph?.(id, true);
  } catch (e) {
    reportFailure('create a graph', e);
  }
}

async function handleDelete(ids) {
  const count = ids.length;
  const ok = await showConfirm({
    message:     count === 1 ? 'Delete this graph? This cannot be undone.' : `Delete ${count} graphs? This cannot be undone.`,
    confirmText: 'Delete',
  });
  if (!ok) return;
  try {
    await deleteGraphs(ids);
    await refreshPicker();
  } catch (e) {
    reportFailure(count === 1 ? 'delete that graph' : 'delete those graphs', e);
  }
}

async function handleCreateFolder(name) {
  try {
    await createFolder(currentUser.id, name);
    await refreshPicker();
  } catch (e) {
    reportFailure('create that folder', e);
  }
}

async function handleDeleteFolder(id) {
  const ok = await showConfirm({
    message:     'Delete this folder? Graphs inside will become ungrouped.',
    confirmText: 'Delete folder',
  });
  if (!ok) return;
  collapsedFolders.delete(id);
  try {
    await deleteFolder(id);
    await refreshPicker();
  } catch (e) {
    reportFailure('delete that folder', e);
  }
}

async function handleMoveToFolder(ids, folderId) {
  try {
    await moveGraphsToFolder(ids, folderId);
    await refreshPicker();
  } catch (e) {
    reportFailure('move those graphs', e);
  }
}
